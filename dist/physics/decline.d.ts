/**
 * Arps Decline Curve Analysis — real petroleum engineering models.
 *
 * Three decline types:
 *   Exponential (b=0): q(t) = qi * exp(-Di * t)
 *   Hyperbolic (0<b<1): q(t) = qi / (1 + b * Di * t)^(1/b)
 *   Harmonic (b=1):     q(t) = qi / (1 + Di * t)
 *
 * Units: qi in bbl/d, Di in 1/month, t in months
 */
export interface DeclineParams {
    qi: number;
    Di: number;
    b: number;
}
export interface DeclinePoint {
    month: number;
    date: string;
    actual: number;
    predicted: number;
    cumulative: number;
}
export interface DeclineCurveResult {
    wellId: string;
    wellName: string;
    params: DeclineParams;
    declineType: 'exponential' | 'hyperbolic' | 'harmonic';
    r2: number;
    eur: number;
    remainingReserves: number;
    history: DeclinePoint[];
    forecast: DeclinePoint[];
}
/** Evaluate Arps equation at time t (months) */
export declare function arpsRate(params: DeclineParams, t: number): number;
/** Cumulative production from Arps (analytical integral) */
export declare function arpsCumulative(params: DeclineParams, t: number): number;
/** Effective decline rate at time t */
export declare function effectiveDeclineRate(params: DeclineParams, t: number): number;
/**
 * Fit Arps parameters to production history using least-squares.
 * Uses grid search + refinement (no external dependencies).
 */
export declare function fitDeclineCurve(history: Array<{
    month: number;
    rate: number;
}>): {
    params: DeclineParams;
    r2: number;
    declineType: 'exponential' | 'hyperbolic' | 'harmonic';
};
/**
 * Generate realistic production history for a well using Arps + noise.
 * This creates physics-based synthetic data (not random — follows real decline behavior).
 */
export declare function generateProductionHistory(wellId: string, wellName: string, currentRate: number, monthsOnProduction: number, seed: number): DeclinePoint[];
/**
 * Calculate EUR (Estimated Ultimate Recovery) to economic limit.
 */
export declare function calculateEUR(params: DeclineParams, economicLimit?: number): number;
