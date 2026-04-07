/**
 * Databricks SQL Warehouse client.
 * In Databricks Apps, uses the service principal's OAuth token.
 */
declare const WAREHOUSE_ID: any;
declare const SCHEMA: any;
/**
 * Execute SQL query. Returns rows or throws.
 */
export declare function executeQuery(sql: string): Promise<Record<string, any>[]>;
export declare function table(name: string): string;
export declare function isDatabricksAvailable(): boolean;
export { WAREHOUSE_ID, SCHEMA };
