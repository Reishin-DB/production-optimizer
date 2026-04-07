/**
 * Databricks client — wires Lakehouse (SQL Warehouse) and Lakebase (PostgreSQL).
 */
export interface DatabricksConfig {
    host: string;
    token: string;
    warehouseId: string;
    lakebaseConfig?: {
        host: string;
        port: number;
        database: string;
    };
}
/** Execute SQL against Databricks SQL Warehouse (Lakehouse / Delta tables). */
export declare function queryLakehouse(config: DatabricksConfig, sql: string): Promise<any[]>;
/** Execute SQL against Lakebase (managed PostgreSQL). */
export declare function queryLakebase(config: DatabricksConfig, sql: string): Promise<any[]>;
