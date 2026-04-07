import { useState, useEffect, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DeclineParams { qi: number; Di: number; b: number; }

interface DeclinePoint {
  month: number; date: string; actual: number; predicted: number; cumulative: number;
}

interface DeclineCurve {
  wellId: string; wellName: string; params: DeclineParams; declineType: string;
  r2: number; eur: number; remainingReserves: number;
  history: DeclinePoint[]; forecast: DeclinePoint[];
}

interface WhatIfResult {
  wellId: string; wellName: string;
  baselineOilRate: number; predictedOilRate: number; oilRateChange: number;
  baselinePressure: number; predictedPressure: number; pressureChange: number;
  baselineNetback: number; predictedNetback: number; netbackChange: number;
  dailyRevenueImpact: number; annualRevenueImpact: number;
  breakthroughRisk: string; explanation: string;
}

interface WhatIfResponse {
  results: WhatIfResult[];
  summary: {
    totalDailyImpact: number; totalAnnualImpact: number;
    wellsAffected: number; avgOilRateChange: number; highRiskWells: number;
  };
}

interface Recommendation {
  id: string; priority: 'high' | 'medium' | 'low';
  title: string; description: string; affectedEntities: string[];
  estimatedImpact: { oilRateChange: number; dailyRevenue: number; annualRevenue: number; };
  physicsRationale: string; risk: string;
}

interface RecsResponse {
  recommendations: Recommendation[];
  summary: { count: number; highPriority: number; totalAnnualImpact: number; };
}

interface FieldEconomics {
  totalRevenue: number; totalOpex: number; totalCO2Cost: number;
  totalTransport: number; fieldNetback: number; incrementalNetback: number;
  breakeven: number; carbonCreditRevenue: number; totalBoe: number; wellCount: number;
}

/* ------------------------------------------------------------------ */
/*  Decline Chart (SVG)                                                */
/* ------------------------------------------------------------------ */

function DeclineChart({ curve, large }: { curve: DeclineCurve; large?: boolean }) {
  const allPoints = [...curve.history, ...curve.forecast];
  if (allPoints.length < 2) return null;

  const W = large ? 600 : 340;
  const H = large ? 240 : 130;
  const pad = { top: 12, right: 12, bottom: 22, left: 44 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const maxRate = Math.max(...allPoints.map(p => Math.max(p.actual, p.predicted))) * 1.1;
  const minMonth = allPoints[0].month;
  const maxMonth = allPoints[allPoints.length - 1].month;
  const monthRange = maxMonth - minMonth || 1;

  const x = (m: number) => pad.left + ((m - minMonth) / monthRange) * cw;
  const y = (r: number) => pad.top + ch - (r / maxRate) * ch;

  const predLine = allPoints.filter(p => p.predicted > 0)
    .map(p => `${x(p.month)},${y(p.predicted)}`).join(' ');

  const forecastStart = curve.history.length > 0
    ? curve.history[curve.history.length - 1].month : 0;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={pad.left} y1={y(maxRate * f)} x2={W - pad.right} y2={y(maxRate * f)}
          stroke="#1e293b" strokeWidth={0.5} />
      ))}
      <rect x={x(forecastStart)} y={pad.top} width={x(maxMonth) - x(forecastStart)} height={ch}
        fill="rgba(234,179,8,0.06)" />
      <text x={x(forecastStart) + 4} y={pad.top + 12} fill="#a16207" fontSize={large ? 9 : 7}
        fontFamily="monospace">FORECAST</text>
      <polyline points={predLine} fill="none" stroke="#3b82f6" strokeWidth={large ? 2 : 1.5} />
      {curve.history.filter(p => p.actual > 0).map((p, i) => (
        <circle key={i} cx={x(p.month)} cy={y(p.actual)} r={large ? 2.5 : 1.5} fill="#10b981" />
      ))}
      {/* CO2 flood response zone */}
      {large && (
        <text x={x(forecastStart * 0.5)} y={H - 4} fill="#64748b" fontSize={8} fontFamily="monospace"
          textAnchor="middle">CO₂ flood response</text>
      )}
      <text x={pad.left} y={H - 3} fill="#64748b" fontSize={large ? 9 : 7} fontFamily="monospace">
        {curve.history[0]?.date?.slice(0, 7) || ''}
      </text>
      <text x={W - pad.right} y={H - 3} fill="#64748b" fontSize={large ? 9 : 7}
        fontFamily="monospace" textAnchor="end">
        {allPoints[allPoints.length - 1]?.date?.slice(0, 7) || ''}
      </text>
      <text x={2} y={H / 2} fill="#64748b" fontSize={large ? 9 : 7} fontFamily="monospace"
        transform={`rotate(-90, 2, ${H / 2})`} textAnchor="middle">bbl/d</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-tab: Wells                                                     */
/* ------------------------------------------------------------------ */

function WellsView({ curves }: { curves: DeclineCurve[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const sel = selected ? curves.find(c => c.wellId === selected) : null;

  return (
    <div className="wells-view">
      {sel ? (
        /* ── Detail view ── */
        <div className="well-detail-view">
          <button className="back-btn" onClick={() => setSelected(null)}>← All Wells</button>
          <div className="well-detail-header">
            <h3>{sel.wellName}</h3>
            <span className={`decline-type type-${sel.declineType}`}>{sel.declineType}</span>
          </div>
          <DeclineChart curve={sel} large />
          <div className="well-detail-stats">
            <div className="stat">
              <span className="stat-label">Initial Rate</span>
              <span className="stat-value">{sel.params.qi.toFixed(0)} <small>bbl/d</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Decline Rate</span>
              <span className="stat-value">{(sel.params.Di * 100).toFixed(1)} <small>%/mo</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">b-factor</span>
              <span className="stat-value">{sel.params.b.toFixed(3)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">R²</span>
              <span className="stat-value">{sel.r2.toFixed(3)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">EUR</span>
              <span className="stat-value">{(sel.eur / 1000).toFixed(0)} <small>K bbl</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Remaining</span>
              <span className="stat-value">{(sel.remainingReserves / 1000).toFixed(0)} <small>K bbl</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Current Rate</span>
              <span className="stat-value">{sel.history[sel.history.length - 1]?.actual.toFixed(0)} <small>bbl/d</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Months On</span>
              <span className="stat-value">{sel.history.length}</span>
            </div>
          </div>
        </div>
      ) : (
        /* ── Grid view ── */
        <div className="wells-grid">
          {curves.map(curve => (
            <div key={curve.wellId} className="well-card" onClick={() => setSelected(curve.wellId)}>
              <div className="decline-header">
                <span className="decline-well">{curve.wellName}</span>
                <span className={`decline-type type-${curve.declineType}`}>{curve.declineType}</span>
              </div>
              <DeclineChart curve={curve} />
              <div className="well-card-footer">
                <span>{curve.history[curve.history.length - 1]?.actual.toFixed(0)} bbl/d</span>
                <span>EUR {(curve.eur / 1000).toFixed(0)}K</span>
                <span>R² {curve.r2.toFixed(3)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-tab: Optimize                                                  */
/* ------------------------------------------------------------------ */

function OptimizeView() {
  const [injChange, setInjChange] = useState(0);
  const [chokeChange, setChokeChange] = useState(0);
  const [co2PriceChange, setCo2PriceChange] = useState(0);
  const [whatIf, setWhatIf] = useState<WhatIfResponse | null>(null);
  const [econ, setEcon] = useState<FieldEconomics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/commercial/field-summary').then(r => r.json()).then(setEcon).catch(() => {});
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/production/what-if', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          injectionRateChange: injChange / 100,
          chokeChange: chokeChange / 100,
          co2PriceChange,
          wagRatioChange: 0,
        }),
      });
      setWhatIf(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [injChange, chokeChange, co2PriceChange]);

  return (
    <div className="optimize-view">
      {/* Field Economics KPI bar */}
      {econ && (
        <div className="econ-bar">
          <div className="econ-kpi">
            <span className="econ-label">Revenue</span>
            <span className="econ-value">${(econ.totalRevenue / 1000).toFixed(0)}K<small>/d</small></span>
            {whatIf && <span className={`econ-delta ${whatIf.summary.totalDailyImpact >= 0 ? 'impact-pos' : 'impact-neg'}`}>
              {whatIf.summary.totalDailyImpact >= 0 ? '+' : ''}${(whatIf.summary.totalDailyImpact / 1000).toFixed(1)}K
            </span>}
          </div>
          <div className="econ-kpi">
            <span className="econ-label">OpEx</span>
            <span className="econ-value">${(econ.totalOpex / 1000).toFixed(0)}K<small>/d</small></span>
          </div>
          <div className="econ-kpi">
            <span className="econ-label">CO₂ Cost</span>
            <span className="econ-value">${(econ.totalCO2Cost / 1000).toFixed(0)}K<small>/d</small></span>
          </div>
          <div className="econ-kpi">
            <span className="econ-label">Netback</span>
            <span className="econ-value">${econ.fieldNetback.toFixed(2)}<small>/boe</small></span>
          </div>
          <div className="econ-kpi">
            <span className="econ-label">Breakeven</span>
            <span className="econ-value">${econ.breakeven}<small>/bbl</small></span>
          </div>
          <div className="econ-kpi">
            <span className="econ-label">Carbon Credits</span>
            <span className="econ-value econ-green">${(econ.carbonCreditRevenue / 1000).toFixed(0)}K<small>/d</small></span>
          </div>
        </div>
      )}

      <div className="opt-controls">
        <h3>Adjust Parameters</h3>
        <div className="opt-sliders">
          <div className="opt-slider">
            <div className="opt-slider-label">
              <span>CO₂ Injection Rate</span>
              <span className={`slider-val ${injChange > 0 ? 'pos' : injChange < 0 ? 'neg' : ''}`}>
                {injChange > 0 ? '+' : ''}{injChange}%
              </span>
            </div>
            <input type="range" min={-30} max={30} step={5} value={injChange}
              onChange={e => setInjChange(Number(e.target.value))} />
          </div>
          <div className="opt-slider">
            <div className="opt-slider-label">
              <span>Choke Position</span>
              <span className={`slider-val ${chokeChange > 0 ? 'pos' : chokeChange < 0 ? 'neg' : ''}`}>
                {chokeChange > 0 ? '+' : ''}{chokeChange}%
              </span>
            </div>
            <input type="range" min={-30} max={30} step={5} value={chokeChange}
              onChange={e => setChokeChange(Number(e.target.value))} />
          </div>
          <div className="opt-slider">
            <div className="opt-slider-label">
              <span>CO₂ Price</span>
              <span className={`slider-val ${co2PriceChange > 0 ? 'pos' : co2PriceChange < 0 ? 'neg' : ''}`}>
                {co2PriceChange > 0 ? '+' : ''}{co2PriceChange.toFixed(2)} $/mcf
              </span>
            </div>
            <input type="range" min={-0.5} max={0.5} step={0.05} value={co2PriceChange}
              onChange={e => setCo2PriceChange(Number(e.target.value))} />
          </div>
        </div>
        <button className="run-btn" onClick={run} disabled={loading}>
          {loading ? 'Computing...' : 'Run Scenario'}
        </button>
      </div>

      {whatIf ? (
        <div className="opt-results">
          {/* Impact summary */}
          <div className="opt-impact-row">
            <div className={`opt-impact-card ${whatIf.summary.totalDailyImpact >= 0 ? 'positive' : 'negative'}`}>
              <span className="opt-impact-label">Daily</span>
              <span className="opt-impact-value">
                {whatIf.summary.totalDailyImpact >= 0 ? '+' : ''}${whatIf.summary.totalDailyImpact.toLocaleString()}/d
              </span>
            </div>
            <div className={`opt-impact-card ${whatIf.summary.totalAnnualImpact >= 0 ? 'positive' : 'negative'}`}>
              <span className="opt-impact-label">Annual</span>
              <span className="opt-impact-value">
                {whatIf.summary.totalAnnualImpact >= 0 ? '+' : ''}${(whatIf.summary.totalAnnualImpact / 1000).toFixed(0)}K
              </span>
            </div>
            <div className="opt-impact-card">
              <span className="opt-impact-label">Avg Oil Δ</span>
              <span className="opt-impact-value">
                {whatIf.summary.avgOilRateChange >= 0 ? '+' : ''}{whatIf.summary.avgOilRateChange} bbl/d
              </span>
            </div>
            <div className={`opt-impact-card ${whatIf.summary.highRiskWells > 0 ? 'negative' : ''}`}>
              <span className="opt-impact-label">High Risk</span>
              <span className="opt-impact-value">{whatIf.summary.highRiskWells} wells</span>
            </div>
          </div>

          {/* Per-well results */}
          <table className="opt-table">
            <thead>
              <tr>
                <th>Well</th><th>Oil Rate</th><th>Δ Oil</th><th>Pressure</th>
                <th>Δ Revenue</th><th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {whatIf.results.map(r => (
                <tr key={r.wellId}>
                  <td className="well-name">{r.wellName}</td>
                  <td>{r.predictedOilRate.toFixed(0)} bbl/d</td>
                  <td className={r.oilRateChange >= 0 ? 'val-pos' : 'val-neg'}>
                    {r.oilRateChange >= 0 ? '+' : ''}{r.oilRateChange.toFixed(1)}
                  </td>
                  <td>{r.predictedPressure} psi</td>
                  <td className={r.dailyRevenueImpact >= 0 ? 'val-pos' : 'val-neg'}>
                    {r.dailyRevenueImpact >= 0 ? '+' : ''}${r.dailyRevenueImpact}/d
                  </td>
                  <td><span className={`risk-badge risk-${r.breakthroughRisk}`}>{r.breakthroughRisk}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          {whatIf.results[0]?.explanation && (
            <div className="opt-explanation">
              {whatIf.results[0].explanation}
            </div>
          )}
        </div>
      ) : (
        <div className="opt-empty">
          Adjust the sliders and click <strong>Run Scenario</strong> to see the physics-based impact on all 16 producer wells.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-tab: Recommendations                                           */
/* ------------------------------------------------------------------ */

function RecommendationsView({ recs }: { recs: RecsResponse | null }) {
  if (!recs || recs.recommendations.length === 0) {
    return <div className="opt-empty">No recommendations at this time.</div>;
  }

  return (
    <div className="recs-view">
      <div className="recs-summary">
        <span>{recs.summary.count} actions identified</span>
        <span className="impact-pos">${(recs.summary.totalAnnualImpact / 1000).toFixed(0)}K/yr total potential</span>
        <span>{recs.summary.highPriority} high priority</span>
      </div>
      <div className="recs-list">
        {recs.recommendations.map(rec => (
          <div key={rec.id} className={`rec-card rec-${rec.priority}`}>
            <div className="rec-header">
              <span className={`priority-badge priority-${rec.priority}`}>{rec.priority}</span>
              <span className="rec-title">{rec.title}</span>
              <span className={`rec-revenue ${rec.estimatedImpact.annualRevenue >= 0 ? 'impact-pos' : 'impact-neg'}`}>
                ${(rec.estimatedImpact.annualRevenue / 1000).toFixed(0)}K/yr
              </span>
            </div>
            <p className="rec-desc">{rec.description}</p>
            <div className="rec-metrics">
              <span className={rec.estimatedImpact.oilRateChange >= 0 ? 'impact-pos' : 'impact-neg'}>
                {rec.estimatedImpact.oilRateChange >= 0 ? '+' : ''}{rec.estimatedImpact.oilRateChange} bbl/d
              </span>
              <span className={rec.estimatedImpact.dailyRevenue >= 0 ? 'impact-pos' : 'impact-neg'}>
                {rec.estimatedImpact.dailyRevenue >= 0 ? '+' : ''}${rec.estimatedImpact.dailyRevenue}/d
              </span>
            </div>
            <details className="rec-physics">
              <summary>Physics Rationale</summary>
              <p>{rec.physicsRationale}</p>
              <p className="rec-risk"><strong>Risk:</strong> {rec.risk}</p>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main: Sub-tab navigation                                           */
/* ------------------------------------------------------------------ */

const SUB_TABS = [
  { id: 'wells', label: 'Wells' },
  { id: 'optimize', label: 'Optimize' },
  { id: 'recommendations', label: 'Recommendations' },
] as const;

type SubTabId = (typeof SUB_TABS)[number]['id'];

export default function ProductionOptimizerTab() {
  const [subTab, setSubTab] = useState<SubTabId>('wells');
  const [curves, setCurves] = useState<DeclineCurve[]>([]);
  const [recs, setRecs] = useState<RecsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/production/decline-curves').then(r => r.json()),
      fetch('/api/production/recommendations').then(r => r.json()),
    ]).then(([dc, rec]) => {
      setCurves(dc);
      setRecs(rec);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="tab-loading">Loading production optimizer...</div>;
  }

  return (
    <div className="prod-opt-tab">
      <nav className="sub-tabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            className={`sub-tab-btn ${subTab === t.id ? 'active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
            {t.id === 'recommendations' && recs && recs.summary.highPriority > 0 && (
              <span className="sub-tab-badge">{recs.summary.highPriority}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sub-tab-content">
        {subTab === 'wells' && <WellsView curves={curves} />}
        {subTab === 'optimize' && <OptimizeView />}
        {subTab === 'recommendations' && <RecommendationsView recs={recs} />}
      </div>
    </div>
  );
}
