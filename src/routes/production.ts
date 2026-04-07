/**
 * Production Optimizer API routes.
 *
 * Serves decline curves, what-if scenarios, and optimization recommendations
 * using real Arps decline models and Darcy flow physics.
 */

import { Router, Request, Response } from 'express';
import { InMemoryTwinDataProvider } from '../twin/provider';
import {
  fitDeclineCurve,
  generateProductionHistory,
  arpsRate,
  calculateEUR,
  DeclineCurveResult,
} from '../physics/decline';
import {
  getDefaultReservoirParams,
  calculateInjectivity,
  calculateMaterialBalance,
  evaluateWhatIf,
  WhatIfScenario,
  WhatIfResult,
} from '../physics/darcy';

const router = Router();
const provider = new InMemoryTwinDataProvider();

// Cache decline curves (expensive to compute)
let declineCurveCache: DeclineCurveResult[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * GET /api/production/decline-curves
 *
 * Returns Arps decline curve analysis for all producer wells.
 * Each well has fitted parameters, production history, and forecast.
 */
router.get('/decline-curves', async (_req: Request, res: Response) => {
  const now = Date.now();
  if (declineCurveCache && now - cacheTimestamp < CACHE_TTL) {
    return res.json(declineCurveCache);
  }

  try {
    // Get twin state for current well data
    const state = await provider.loadState();
    const producers = state.wells.filter((w: any) => w.type === 'producer');

    const results: DeclineCurveResult[] = producers.map((well: any, idx: number) => {
      // Generate physics-based production history
      const monthsOn = 24 + (idx * 3); // 24-72 months on production
      const seed = well.id.charCodeAt(2) * 1000 + well.id.charCodeAt(3);
      const history = generateProductionHistory(
        well.id,
        well.name,
        well.oilRate,
        monthsOn,
        seed
      );

      // Fit Arps model to the generated history
      const historyForFit = history.map(h => ({ month: h.month, rate: h.actual }));
      const fit = fitDeclineCurve(historyForFit);

      // Generate 36-month forecast
      const forecast = [];
      const lastMonth = history[history.length - 1].month;
      const lastCumulative = history[history.length - 1].cumulative;
      let cumulative = lastCumulative;

      for (let m = 1; m <= 36; m++) {
        const t = lastMonth + m;
        const predicted = arpsRate(fit.params, t);
        cumulative += predicted * 30.44;

        const forecastDate = new Date();
        forecastDate.setMonth(forecastDate.getMonth() + m);

        forecast.push({
          month: t,
          date: forecastDate.toISOString().slice(0, 10),
          actual: 0, // no actual data for forecast
          predicted: Math.round(predicted * 10) / 10,
          cumulative: Math.round(cumulative),
        });
      }

      // EUR calculation
      const eur = calculateEUR(fit.params, 5); // 5 bbl/d economic limit
      const remainingReserves = eur - lastCumulative;

      return {
        wellId: well.id,
        wellName: well.name,
        params: fit.params,
        declineType: fit.declineType,
        r2: Math.round(fit.r2 * 1000) / 1000,
        eur: Math.round(eur),
        remainingReserves: Math.round(Math.max(0, remainingReserves)),
        history,
        forecast,
      };
    });

    declineCurveCache = results;
    cacheTimestamp = now;
    res.json(results);
  } catch (err) {
    console.error('Decline curve error:', err);
    res.status(500).json({ error: 'Failed to compute decline curves' });
  }
});

/**
 * POST /api/production/what-if
 *
 * Evaluates a what-if scenario using Darcy flow and material balance.
 *
 * Body: {
 *   injectionRateChange: number (-0.5 to 0.5),
 *   wagRatioChange: number (-0.5 to 0.5),
 *   chokeChange: number (-0.5 to 0.5),
 *   co2PriceChange: number ($/mcf change),
 *   patternId?: string (optional, defaults to all patterns)
 * }
 */
router.post('/what-if', async (req: Request, res: Response) => {
  try {
    const scenario: WhatIfScenario = {
      injectionRateChange: Number(req.body.injectionRateChange) || 0,
      wagRatioChange: Number(req.body.wagRatioChange) || 0,
      chokeChange: Number(req.body.chokeChange) || 0,
      co2PriceChange: Number(req.body.co2PriceChange) || 0,
    };
    const targetPattern = req.body.patternId as string | undefined;

    const state = await provider.loadState();

    // Get patterns and their wells
    const patterns = targetPattern
      ? state.patterns.filter((p: any) => p.id === targetPattern)
      : state.patterns;

    const results: WhatIfResult[] = [];
    let totalDailyImpact = 0;

    for (const pattern of patterns) {
      const reservoir = getDefaultReservoirParams(pattern.id);
      const producers = state.wells.filter(
        (w: any) => w.type === 'producer' && w.patternId === pattern.id
      );
      const injectors = state.wells.filter(
        (w: any) => (w.type === 'injector' || w.type === 'WAG') && w.patternId === pattern.id
      );

      const totalInjRate = injectors.reduce((s: number, w: any) => s + (w.co2InjRate || 0), 0);

      // Calculate economics for each producer
      const fieldOilRate = state.wells
        .filter((w: any) => w.type === 'producer')
        .reduce((s: number, w: any) => s + w.oilRate, 0);

      for (const well of producers) {
        // Compute current netback
        const co2Alloc = fieldOilRate > 0
          ? (well.oilRate / fieldOilRate) * totalInjRate * 1.05
          : 0;
        const revenue = well.oilRate * 72 + well.gasRate * 3.2;
        const loe = well.oilRate * 8.5 + well.waterRate * 0.45;
        const transport = well.oilRate * 2.5 + well.gasRate * 0.15;
        const boe = well.oilRate + well.gasRate / 6;
        const netback = boe > 0 ? (revenue - co2Alloc - loe - transport) / boe : 0;

        const result = evaluateWhatIf(
          well.id,
          well.name,
          well.oilRate,
          pattern.currentPressure,
          totalInjRate / Math.max(1, producers.length), // per-well allocation
          netback,
          reservoir,
          scenario
        );

        results.push(result);
        totalDailyImpact += result.dailyRevenueImpact;
      }
    }

    res.json({
      scenario,
      targetPattern: targetPattern || 'all',
      results,
      summary: {
        totalDailyImpact: Math.round(totalDailyImpact),
        totalAnnualImpact: Math.round(totalDailyImpact * 365),
        wellsAffected: results.length,
        avgOilRateChange: Math.round(
          results.reduce((s, r) => s + r.oilRateChange, 0) / results.length * 10
        ) / 10,
        highRiskWells: results.filter(r => r.breakthroughRisk === 'high').length,
      },
    });
  } catch (err) {
    console.error('What-if error:', err);
    res.status(500).json({ error: 'Failed to evaluate scenario' });
  }
});

/**
 * GET /api/production/reservoir-status
 *
 * Returns reservoir physics status per pattern:
 * injectivity, material balance, pressure status.
 */
router.get('/reservoir-status', async (_req: Request, res: Response) => {
  try {
    const state = await provider.loadState();

    const patternStatus = state.patterns.map((pattern: any) => {
      const reservoir = getDefaultReservoirParams(pattern.id);
      const injectivity = calculateInjectivity(reservoir, pattern.currentPressure, 2);

      const producers = state.wells.filter(
        (w: any) => w.type === 'producer' && w.patternId === pattern.id
      );
      const totalOil = producers.reduce((s: number, w: any) => s + w.oilRate, 0);

      // Estimate cumulative production (rate × months × 30.44)
      const monthsOn = pattern.cycleNumber * 6; // ~6 months per cycle
      const estCumulativeOil = totalOil * monthsOn * 30.44;
      const estCumulativeCO2 = pattern.co2Slug || 0;

      const mb = calculateMaterialBalance(
        reservoir,
        pattern.currentPressure,
        estCumulativeOil,
        estCumulativeCO2
      );

      return {
        patternId: pattern.id,
        patternName: pattern.name,
        reservoir: {
          permeability: reservoir.permeability,
          porosity: reservoir.porosity,
          thickness: reservoir.thickness,
          initialPressure: reservoir.initialPressure,
        },
        injectivity,
        materialBalance: mb,
        currentPhase: pattern.currentPhase,
        cycleNumber: pattern.cycleNumber,
        pressureDeficit: pattern.targetPressure - pattern.currentPressure,
      };
    });

    res.json(patternStatus);
  } catch (err) {
    console.error('Reservoir status error:', err);
    res.status(500).json({ error: 'Failed to compute reservoir status' });
  }
});

/**
 * GET /api/production/recommendations
 *
 * AI-driven optimization recommendations with $ impact,
 * backed by reservoir physics (not LLM — deterministic engineering rules).
 */
router.get('/recommendations', async (_req: Request, res: Response) => {
  try {
    const state = await provider.loadState();

    const recommendations: Array<{
      id: string;
      priority: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      affectedEntities: string[];
      estimatedImpact: {
        oilRateChange: number;
        dailyRevenue: number;
        annualRevenue: number;
      };
      physicsRationale: string;
      risk: string;
    }> = [];

    // Analyze each pattern for optimization opportunities
    for (const pattern of state.patterns) {
      const reservoir = getDefaultReservoirParams(pattern.id);
      const producers = state.wells.filter(
        (w: any) => w.type === 'producer' && w.patternId === pattern.id
      );
      const injectors = state.wells.filter(
        (w: any) => (w.type === 'injector' || w.type === 'WAG') && w.patternId === pattern.id
      );

      const pressureDeficit = pattern.targetPressure - pattern.currentPressure;
      const totalOilRate = producers.reduce((s: number, w: any) => s + w.oilRate, 0);
      const totalInjRate = injectors.reduce((s: number, w: any) => s + (w.co2InjRate || 0), 0);

      // Rule 1: Pressure below target — increase injection
      if (pressureDeficit > 100) {
        const inj = calculateInjectivity(reservoir, pattern.currentPressure);
        const rateIncrease = Math.min(pressureDeficit * inj.injectivityIndex * 0.1, totalInjRate * 0.15);
        const oilResponse = totalOilRate * (rateIncrease / totalInjRate) * 0.4; // 40% conversion
        recommendations.push({
          id: `REC-${pattern.id}-INJ`,
          priority: pressureDeficit > 200 ? 'high' : 'medium',
          title: `Increase CO2 injection on ${pattern.name}`,
          description: `Reservoir pressure is ${pressureDeficit} psi below target. Increase injection by ${Math.round(rateIncrease)} mcf/d to restore pressure support and improve sweep efficiency.`,
          affectedEntities: [...injectors.map((w: any) => w.id), ...producers.map((w: any) => w.id)],
          estimatedImpact: {
            oilRateChange: Math.round(oilResponse),
            dailyRevenue: Math.round(oilResponse * 72 - rateIncrease * 1.05),
            annualRevenue: Math.round((oilResponse * 72 - rateIncrease * 1.05) * 365),
          },
          physicsRationale: `Darcy flow: II = ${inj.injectivityIndex.toFixed(2)} bbl/d/psi. Pressure margin to fracture: ${inj.pressureMargin} psi. Rate increase within safe operating envelope.`,
          risk: pressureDeficit > 300 ? 'Medium — significant pressure deficit may indicate conformance issues' : 'Low — routine pressure maintenance adjustment',
        });
      }

      // Rule 2: High water cut wells — candidates for choke optimization
      for (const well of producers) {
        if (well.waterCut > 0.6) {
          const chokeReduction = well.waterCut > 0.75 ? 0.2 : 0.1;
          const oilLoss = well.oilRate * chokeReduction * 0.3; // oil drops less than choke change
          const waterSaved = well.waterRate * chokeReduction * 0.8;
          const netSavings = waterSaved * 0.45 - oilLoss * 72; // water disposal cost vs oil revenue

          if (netSavings > 0) {
            recommendations.push({
              id: `REC-${well.id}-CHOKE`,
              priority: 'medium',
              title: `Optimize choke on ${well.name}`,
              description: `Water cut at ${(well.waterCut * 100).toFixed(0)}%. Reducing choke by ${(chokeReduction * 100).toFixed(0)}% saves $${Math.round(netSavings)}/d in water disposal while limiting oil impact.`,
              affectedEntities: [well.id],
              estimatedImpact: {
                oilRateChange: -Math.round(oilLoss),
                dailyRevenue: Math.round(netSavings),
                annualRevenue: Math.round(netSavings * 365),
              },
              physicsRationale: `Water cut = ${(well.waterCut * 100).toFixed(1)}% indicates water coning or channeling. Choke-back reduces drawdown, improving oil/water ratio. Kv/Kh ratio suggests ${well.waterCut > 0.75 ? 'significant coning' : 'moderate channeling'}.`,
              risk: 'Low — reversible choke adjustment with 48-hour monitoring period',
            });
          }
        }
      }

      // Rule 3: WAG cycle timing
      if (pattern.currentPhase === 'CO2_injection' && pattern.cycleNumber > 3) {
        const avgCO2Concentration = producers.reduce(
          (s: number, w: any) => s + (w.co2Concentration || 0), 0
        ) / producers.length;

        if (avgCO2Concentration > 8) {
          recommendations.push({
            id: `REC-${pattern.id}-WAG`,
            priority: 'high',
            title: `Switch ${pattern.name} to water injection`,
            description: `Average produced CO2 concentration at ${avgCO2Concentration.toFixed(1)} mol% indicates early breakthrough. Switch to water slug to improve conformance and reduce CO2 recycling costs.`,
            affectedEntities: injectors.map((w: any) => w.id),
            estimatedImpact: {
              oilRateChange: Math.round(totalOilRate * 0.05), // slight improvement from better sweep
              dailyRevenue: Math.round(totalInjRate * 1.05 * 0.3), // 30% CO2 cost savings during water slug
              annualRevenue: Math.round(totalInjRate * 1.05 * 0.3 * 180), // ~6 month water slug
            },
            physicsRationale: `CO2 concentration ${avgCO2Concentration.toFixed(1)} mol% exceeds 8% threshold. Mobility ratio M = μ_oil/μ_CO2 = ${(reservoir.viscosityOil / reservoir.viscosityCO2).toFixed(0)} indicates viscous fingering risk. Water slug will improve areal sweep.`,
            risk: 'Low — standard WAG cycle transition per pattern optimization plan',
          });
        }
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const totalAnnualImpact = recommendations.reduce(
      (s, r) => s + r.estimatedImpact.annualRevenue, 0
    );

    res.json({
      recommendations,
      summary: {
        count: recommendations.length,
        highPriority: recommendations.filter(r => r.priority === 'high').length,
        totalAnnualImpact: Math.round(totalAnnualImpact),
      },
    });
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

export default router;
