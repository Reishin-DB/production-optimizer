import { Request, Response, NextFunction } from 'express';
export declare const ROLES: {
    readonly PROD_ENGINEER: "ROLE_PROD_ENGINEER";
    readonly RESERVOIR_ENGINEER: "ROLE_RESERVOIR_ENGINEER";
    readonly COMMERCIAL_ANALYST: "ROLE_COMMERCIAL_ANALYST";
    readonly HSE: "ROLE_HSE";
    readonly SHIFT_SUPERVISOR: "ROLE_SHIFT_SUPERVISOR";
    readonly FINANCE: "ROLE_FINANCE";
    readonly AI_AGENT_PROD: "ROLE_AI_AGENT_PROD";
    readonly AI_AGENT_COMM: "ROLE_AI_AGENT_COMM";
};
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                name: string;
                roles: string[];
            };
        }
    }
}
/**
 * Attach demo user identity. In production, replace with Databricks OAuth
 * SP identity extraction from the request headers.
 * Perimeter auth is handled by Databricks Apps OAuth — this is internal role-gating only.
 */
export declare function attachDemoUser(req: Request, _res: Response, next: NextFunction): void;
export declare function requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => any;
