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
  qi: number;    // initial production rate (bbl/d)
  Di: number;    // initial decline rate (1/month, nominal)
  b: number;     // decline exponent (0 = exponential, 0-1 = hyperbolic, 1 = harmonic)
}

export interface DeclinePoint {
  month: number;
  date: string;       // ISO date
  actual: number;     // actual production (bbl/d)
  predicted: number;  // Arps model prediction (bbl/d)
  cumulative: number; // cumulative production (bbl)
}

export interface DeclineCurveResult {
  wellId: string;
  wellName: string;
  params: DeclineParams;
  declineType: 'exponential' | 'hyperbolic' | 'harmonic';
  r2: number;              // goodness of fit
  eur: number;             // estimated ultimate recovery (bbl)
  remainingReserves: number;
  history: DeclinePoint[];
  forecast: DeclinePoint[];
}

/** Evaluate Arps equation at time t (months) */
export function arpsRate(params: DeclineParams, t: number): number {
  const { qi, Di, b } = params;
  if (t < 0) return qi;

  if (b === 0) {
    // Exponential
    return qi * Math.exp(-Di * t);
  } else if (b === 1) {
    // Harmonic
    return qi / (1 + Di * t);
  } else {
    // Hyperbolic
    return qi / Math.pow(1 + b * Di * t, 1 / b);
  }
}

/** Cumulative production from Arps (analytical integral) */
export function arpsCumulative(params: DeclineParams, t: number): number {
  const { qi, Di, b } = params;
  if (t <= 0) return 0;

  // Convert to daily (multiply by 30.44 days/month for cumulative)
  const daysPerMonth = 30.44;

  if (b === 0) {
    // Np = (qi / Di) * (1 - exp(-Di * t))
    return (qi / Di) * (1 - Math.exp(-Di * t)) * daysPerMonth;
  } else if (b === 1) {
    // Np = (qi / Di) * ln(1 + Di * t)
    return (qi / Di) * Math.log(1 + Di * t) * daysPerMonth;
  } else {
    // Np = (qi / ((1-b) * Di)) * (1 - (1 + b*Di*t)^((b-1)/b))
    const term = Math.pow(1 + b * Di * t, (b - 1) / b);
    return (qi / ((1 - b) * Di)) * (1 - term) * daysPerMonth;
  }
}

/** Effective decline rate at time t */
export function effectiveDeclineRate(params: DeclineParams, t: number): number {
  const { Di, b } = params;
  // De(t) = Di / (1 + b * Di * t)
  return Di / (1 + b * Di * t);
}

/**
 * Fit Arps parameters to production history using least-squares.
 * Uses grid search + refinement (no external dependencies).
 */
export function fitDeclineCurve(
  history: Array<{ month: number; rate: number }>
): { params: DeclineParams; r2: number; declineType: 'exponential' | 'hyperbolic' | 'harmonic' } {
  if (history.length < 3) {
    return {
      params: { qi: history[0]?.rate ?? 100, Di: 0.05, b: 0.5 },
      r2: 0,
      declineType: 'hyperbolic',
    };
  }

  // Find peak rate for qi estimate
  const peakRate = Math.max(...history.map(h => h.rate));
  const meanRate = history.reduce((s, h) => s + h.rate, 0) / history.length;

  let bestParams: DeclineParams = { qi: peakRate, Di: 0.05, b: 0.5 };
  let bestSSE = Infinity;

  // Grid search over parameter space
  const qiRange = [peakRate * 0.9, peakRate, peakRate * 1.1, peakRate * 1.2];
  const diRange = [0.01, 0.02, 0.03, 0.05, 0.07, 0.10, 0.15, 0.20];
  const bRange = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0];

  for (const qi of qiRange) {
    for (const Di of diRange) {
      for (const b of bRange) {
        const params = { qi, Di, b };
        let sse = 0;
        for (const h of history) {
          const pred = arpsRate(params, h.month);
          sse += (h.rate - pred) ** 2;
        }
        if (sse < bestSSE) {
          bestSSE = sse;
          bestParams = params;
        }
      }
    }
  }

  // Refine with finer grid around best
  const refineQi = [bestParams.qi * 0.95, bestParams.qi, bestParams.qi * 1.05];
  const refineDi = [bestParams.Di * 0.8, bestParams.Di * 0.9, bestParams.Di, bestParams.Di * 1.1, bestParams.Di * 1.2];
  const refineB = [
    Math.max(0, bestParams.b - 0.1),
    bestParams.b,
    Math.min(1, bestParams.b + 0.1),
  ];

  for (const qi of refineQi) {
    for (const Di of refineDi) {
      for (const b of refineB) {
        const params = { qi, Di, b };
        let sse = 0;
        for (const h of history) {
          const pred = arpsRate(params, h.month);
          sse += (h.rate - pred) ** 2;
        }
        if (sse < bestSSE) {
          bestSSE = sse;
          bestParams = params;
        }
      }
    }
  }

  // Calculate R²
  const ssTot = history.reduce((s, h) => s + (h.rate - meanRate) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - bestSSE / ssTot : 0;

  // Classify decline type
  let declineType: 'exponential' | 'hyperbolic' | 'harmonic';
  if (bestParams.b < 0.05) declineType = 'exponential';
  else if (bestParams.b > 0.95) declineType = 'harmonic';
  else declineType = 'hyperbolic';

  return { params: bestParams, r2, declineType };
}

/**
 * Generate realistic production history for a well using Arps + noise.
 * This creates physics-based synthetic data (not random — follows real decline behavior).
 */
export function generateProductionHistory(
  wellId: string,
  wellName: string,
  currentRate: number,
  monthsOnProduction: number,
  seed: number
): DeclinePoint[] {
  // Derive Arps params from current state
  // Assume well started at higher rate and declined to current
  const rng = seededRandom(seed);

  // Delaware Basin CO2-EOR typical parameters
  const b = 0.4 + rng() * 0.4;           // 0.4-0.8 typical for CO2 flood
  const Di = 0.03 + rng() * 0.07;        // 3-10% monthly decline
  // Back-calculate qi from current rate: q(t) = qi / (1 + b*Di*t)^(1/b)
  // qi = q(t) * (1 + b*Di*t)^(1/b)
  const qi = currentRate * Math.pow(1 + b * Di * monthsOnProduction, 1 / b);

  const params: DeclineParams = { qi, Di, b };
  const history: DeclinePoint[] = [];
  let cumulative = 0;

  // Generate start date (monthsOnProduction months ago)
  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - monthsOnProduction);

  for (let m = 0; m <= monthsOnProduction; m++) {
    const predicted = arpsRate(params, m);
    // Add realistic noise (±5-10% production variance)
    const noise = 1 + (rng() - 0.5) * 0.12;
    // CO2 flood response: add bump at ~40-60% of well life (tertiary recovery response)
    const floodResponse = m > monthsOnProduction * 0.3 && m < monthsOnProduction * 0.7
      ? 1 + 0.15 * Math.sin(Math.PI * (m - monthsOnProduction * 0.3) / (monthsOnProduction * 0.4))
      : 1;
    const actual = Math.max(10, predicted * noise * floodResponse);
    cumulative += actual * 30.44; // monthly cumulative

    const date = new Date(startDate);
    date.setMonth(date.getMonth() + m);

    history.push({
      month: m,
      date: date.toISOString().slice(0, 10),
      actual: Math.round(actual * 10) / 10,
      predicted: Math.round(predicted * 10) / 10,
      cumulative: Math.round(cumulative),
    });
  }

  return history;
}

/** Simple seeded PRNG for reproducible results */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Calculate EUR (Estimated Ultimate Recovery) to economic limit.
 */
export function calculateEUR(params: DeclineParams, economicLimit: number = 5): number {
  // Find time when rate drops to economic limit
  // q(t) = economicLimit → solve for t
  const { qi, Di, b } = params;
  let tMax: number;

  if (b === 0) {
    tMax = -Math.log(economicLimit / qi) / Di;
  } else {
    tMax = (Math.pow(qi / economicLimit, b) - 1) / (b * Di);
  }

  // Cap at 600 months (50 years)
  tMax = Math.min(tMax, 600);

  return arpsCumulative(params, tMax);
}
