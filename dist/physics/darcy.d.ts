/**
 * Darcy Flow & Reservoir Physics — real petroleum engineering models.
 *
 * Darcy's Law: Q = (k * A * ΔP) / (μ * L)
 * Injectivity Index: II = Q / (Pwf - Pr)
 * Material Balance: P/Z method for reservoir pressure tracking
 */
export interface ReservoirParams {
    permeability: number;
    porosity: number;
    thickness: number;
    area: number;
    viscosityOil: number;
    viscosityCO2: number;
    compressibility: number;
    initialPressure: number;
    bubblePoint: number;
    temperature: number;
    waterSaturation: number;
    co2Saturation: number;
}
export interface InjectivityResult {
    injectivityIndex: number;
    maxInjectionRate: number;
    fracturePressure: number;
    currentBHP: number;
    pressureMargin: number;
    skinFactor: number;
}
export interface MaterialBalanceResult {
    currentPressure: number;
    pressureDepletion: number;
    recoveryFactor: number;
    ooip: number;
    cumulativeProduction: number;
    driveIndex: {
        solution: number;
        water: number;
        co2Flood: number;
        compaction: number;
    };
}
export interface WhatIfScenario {
    injectionRateChange: number;
    wagRatioChange: number;
    chokeChange: number;
    co2PriceChange: number;
}
export interface WhatIfResult {
    wellId: string;
    wellName: string;
    baselineOilRate: number;
    predictedOilRate: number;
    oilRateChange: number;
    baselinePressure: number;
    predictedPressure: number;
    pressureChange: number;
    baselineNetback: number;
    predictedNetback: number;
    netbackChange: number;
    dailyRevenueImpact: number;
    annualRevenueImpact: number;
    breakthroughRisk: 'low' | 'medium' | 'high';
    explanation: string;
}
/** Delaware Basin CO2-EOR typical reservoir parameters */
export declare function getDefaultReservoirParams(patternId: string): ReservoirParams;
/**
 * Calculate injectivity index using Darcy's radial flow equation.
 *
 * II = (0.00708 * k * h) / (μ * (ln(re/rw) + s))
 *
 * where:
 *   k = permeability (md)
 *   h = thickness (ft)
 *   μ = viscosity (cp) — use CO2 viscosity for injection
 *   re = drainage radius (ft)
 *   rw = wellbore radius (ft, typically 0.354)
 *   s = skin factor
 */
export declare function calculateInjectivity(reservoir: ReservoirParams, currentBHP: number, skinFactor?: number): InjectivityResult;
/**
 * Material balance — simplified P/Z for gas-drive + CO2 flood.
 *
 * OOIP = (7758 * A * h * φ * (1 - Sw)) / Bo
 * RF = 1 - (P/Pi) * (Boi/Bo) + CO2 sweep contribution
 */
export declare function calculateMaterialBalance(reservoir: ReservoirParams, currentPressure: number, cumulativeOil: number, cumulativeCO2Injected: number): MaterialBalanceResult;
/**
 * What-if scenario analysis — predicts production/economic impact
 * of operational changes using reservoir physics.
 */
export declare function evaluateWhatIf(wellId: string, wellName: string, currentOilRate: number, currentPressure: number, currentInjRate: number, currentNetback: number, reservoir: ReservoirParams, scenario: WhatIfScenario, oilPrice?: number, co2Price?: number): WhatIfResult;
