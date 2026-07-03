"use strict";
/**
 * Databricks SQL Warehouse client.
 * In Databricks Apps, uses the service principal's OAuth token.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA = exports.WAREHOUSE_ID = void 0;
exports.executeQuery = executeQuery;
exports.table = table;
exports.isDatabricksAvailable = isDatabricksAvailable;
const WAREHOUSE_ID = process.env.DATABRICKS_WAREHOUSE_ID || '';
exports.WAREHOUSE_ID = WAREHOUSE_ID;
const SCHEMA = process.env.UC_SCHEMA || '';
exports.SCHEMA = SCHEMA;
let _cachedToken = null;
let _tokenExpiry = 0;
/**
 * Normalize the Databricks host. In Databricks Apps, DATABRICKS_HOST is injected
 * WITHOUT the https:// scheme (e.g. "fevm-oil-pump-monitor.cloud.databricks.com"),
 * which makes fetch() throw "Invalid URL". Prepend the scheme if missing.
 */
function normalizeHost() {
    const raw = (process.env.DATABRICKS_HOST || process.env.DATABRICKS_INSTANCE_URL || '').replace(/\/$/, '');
    if (!raw)
        return '';
    return raw.startsWith('http') ? raw : `https://${raw}`;
}
/** Get OAuth token for the app's service principal */
async function getToken() {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpiry)
        return _cachedToken;
    // Check explicit token first
    const explicit = process.env.DATABRICKS_TOKEN || process.env.DATABRICKS_API_TOKEN;
    if (explicit) {
        _cachedToken = explicit;
        _tokenExpiry = now + 3600_000;
        return explicit;
    }
    // Databricks Apps: get token from the managed identity endpoint
    const host = normalizeHost();
    if (!host)
        throw new Error('NO_HOST');
    // Try the OAuth token endpoint (Databricks Apps provides this)
    try {
        const resp = await fetch(`${host}/oidc/v1/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&scope=all-apis&client_id=${process.env.DATABRICKS_CLIENT_ID || ''}&client_secret=${process.env.DATABRICKS_CLIENT_SECRET || ''}`,
        });
        if (resp.ok) {
            const data = await resp.json();
            _cachedToken = data.access_token;
            _tokenExpiry = now + (data.expires_in || 3600) * 1000 - 60_000;
            return _cachedToken;
        }
    }
    catch { /* try next */ }
    // Fallback: check if running in notebook/cluster with managed token
    try {
        const resp = await fetch(`${host}/api/2.0/preview/scim/v2/Me`, {
            headers: { 'Authorization': 'Bearer ' },
        });
        // If this somehow works, we have ambient auth
    }
    catch { /* ignore */ }
    throw new Error('NO_DATABRICKS_TOKEN');
}
/**
 * Execute SQL query. Returns rows or throws.
 */
async function executeQuery(sql) {
    const host = normalizeHost();
    if (!host)
        throw new Error('NO_DATABRICKS_HOST');
    const token = await getToken();
    const url = `${host}/api/2.0/sql/statements`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            statement: sql,
            warehouse_id: WAREHOUSE_ID,
            wait_timeout: '30s',
            disposition: 'INLINE',
            format: 'JSON_ARRAY',
        }),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`SQL API ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    if (data?.status?.state !== 'SUCCEEDED') {
        throw new Error(`SQL ${data?.status?.state}: ${data?.status?.error?.message || ''}`);
    }
    const columns = (data.manifest?.schema?.columns || []).map((c) => c.name);
    const rawRows = data.result?.data_array || [];
    return rawRows.map((row) => {
        const obj = {};
        columns.forEach((col, i) => {
            const val = row[i];
            if (val !== null && val !== '' && !isNaN(Number(val))) {
                obj[col] = Number(val);
            }
            else {
                obj[col] = val;
            }
        });
        return obj;
    });
}
function table(name) {
    return `${SCHEMA}.${name}`;
}
function isDatabricksAvailable() {
    return !!(process.env.DATABRICKS_HOST || process.env.DATABRICKS_INSTANCE_URL);
}
