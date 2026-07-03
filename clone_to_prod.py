"""Clone oil_pump_monitor_catalog.production_optimizer -> energy_utilities.production_optimizer."""

from __future__ import annotations
import time
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

DEV_PROFILE = "fe-vm-oil-pump-monitor"
PROD_PROFILE = "fevm-mfg-industry-prod"
DEV_WAREHOUSE = "87e069097741b56c"
PROD_WAREHOUSE = "47e34bcee8ce206b"
SRC_CATALOG = "oil_pump_monitor_catalog"
SRC_SCHEMA = "production_optimizer"
DST_CATALOG = "energy_utilities"
DST_SCHEMA = "production_optimizer"

TABLES = [
    "bronze_patterns",
    "bronze_wells",
    "gold_decline_curves",
    "gold_field_economics",
    "gold_recommendations",
    "petroleum_documents",
    "silver_economics",
    "silver_production_history",
]

TAGS = {
    "mfg_subindustry": "Oil & Gas Upstream",
    "mfg_outcome_usecase": "Production Monitoring",
}


def exec_sql(client, warehouse_id, sql, wait="50s"):
    resp = client.statement_execution.execute_statement(
        warehouse_id=warehouse_id, statement=sql, wait_timeout=wait
    )
    while resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(1)
        resp = client.statement_execution.get_statement(resp.statement_id)
    if resp.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"SQL failed: {resp.status.error}\nSQL: {sql[:300]}")
    return resp


def get_ddl(client, table):
    r = exec_sql(client, DEV_WAREHOUSE, f"SHOW CREATE TABLE {SRC_CATALOG}.{SRC_SCHEMA}.{table}")
    return r.result.data_array[0][0].replace(
        f"{SRC_CATALOG}.{SRC_SCHEMA}.{table}",
        f"{DST_CATALOG}.{DST_SCHEMA}.{table}",
        1,
    )


def fetch_rows(client, table):
    r = exec_sql(client, DEV_WAREHOUSE, f"SELECT * FROM {SRC_CATALOG}.{SRC_SCHEMA}.{table}")
    cols = [c.name for c in r.manifest.schema.columns]
    types = [c.type_name.value if hasattr(c.type_name, "value") else c.type_name for c in r.manifest.schema.columns]
    return cols, types, (r.result.data_array or [])


def lit(val, t):
    if val is None:
        return "NULL"
    t = (t.upper() if isinstance(t, str) else str(t).upper())
    if t in ("STRING", "VARCHAR", "CHAR"):
        return "'" + val.replace("'", "''") + "'"
    if t == "TIMESTAMP":
        return f"TIMESTAMP '{val}'"
    if t == "DATE":
        return f"DATE '{val}'"
    if t in ("BOOLEAN", "BOOL"):
        return "true" if str(val).lower() in ("true", "1") else "false"
    if t in ("ARRAY", "MAP", "STRUCT") or t.startswith(("ARRAY<", "MAP<", "STRUCT<")):
        # Values come back as JSON strings; round-trip via from_json
        json_str = val if isinstance(val, str) else __import__("json").dumps(val)
        escaped = json_str.replace("'", "''")
        # Default to array<string> if the type is just "ARRAY"
        spark_type = "array<string>" if t == "ARRAY" else t.lower()
        return f"from_json('{escaped}', '{spark_type}')"
    return str(val)


def insert_rows(client, table, cols, types, rows):
    if not rows:
        return 0
    col_list = ", ".join(cols)
    parts = ["(" + ", ".join(lit(r[i], types[i]) for i in range(len(cols))) + ")" for r in rows]
    chunk = 50
    n = 0
    for i in range(0, len(parts), chunk):
        batch = parts[i:i + chunk]
        exec_sql(client, PROD_WAREHOUSE,
                 f"INSERT INTO {DST_CATALOG}.{DST_SCHEMA}.{table} ({col_list}) VALUES " + ", ".join(batch))
        n += len(batch)
    return n


def main():
    dev = WorkspaceClient(profile=DEV_PROFILE)
    prod = WorkspaceClient(profile=PROD_PROFILE)
    print(f"==> Create schema {DST_CATALOG}.{DST_SCHEMA}")
    exec_sql(prod, PROD_WAREHOUSE, f"CREATE SCHEMA IF NOT EXISTS {DST_CATALOG}.{DST_SCHEMA}")
    for t in TABLES:
        print(f"==> {t}")
        ddl = get_ddl(dev, t).replace("CREATE TABLE ", "CREATE OR REPLACE TABLE ", 1)
        exec_sql(prod, PROD_WAREHOUSE, ddl)
        cols, types, rows = fetch_rows(dev, t)
        n = insert_rows(prod, t, cols, types, rows)
        print(f"  copied {n}/{len(rows)} rows")
    print("==> Apply tags")
    pairs = ", ".join(f"'{k}'='{v}'" for k, v in TAGS.items())
    exec_sql(prod, PROD_WAREHOUSE, f"ALTER SCHEMA {DST_CATALOG}.{DST_SCHEMA} SET TAGS ({pairs})")
    print("==> Verify")
    parts = [f"SELECT '{t}' AS t, COUNT(*) AS n FROM {DST_CATALOG}.{DST_SCHEMA}.{t}" for t in TABLES]
    r = exec_sql(prod, PROD_WAREHOUSE, " UNION ALL ".join(parts))
    for n, c in r.result.data_array:
        print(f"  {n}: {c}")
    print("Done.")


if __name__ == "__main__":
    main()
