import { useState } from 'react'

/* ────────────────────────────────────────────────────────────────────────
 * Data & AI Flow — CO2-EOR Digital Twin
 * Native SVG node-and-edge diagram (Drilling Command Center style):
 * click any node for detail, orange dashed box = Unity Catalog governance.
 * ──────────────────────────────────────────────────────────────────────── */

interface NodeDef {
  id: string
  label: string
  sub: string
  x: number; y: number; w: number; h: number
  color: string
  badge?: string
  detail: string[]
}
interface EdgeDef { from: string; to: string; label: string; color?: string; dashed?: boolean }

// ─── Row 1: Sources ─────────────────────────────────────────────────────────
const SOURCES: NodeDef[] = [
  { id: 'scada', label: 'SCADA / RTU', sub: 'wellhead telemetry', x: 40, y: 64, w: 150, h: 54, color: '#3b82f6', badge: 'SOURCE',
    detail: ['Wellhead + facility telemetry', 'BHP, tubing / casing pressure', 'Choke positions, flow rates', 'OPC-UA / Modbus → Auto Loader'] },
  { id: 'iot', label: 'IoT Sensors', sub: 'downhole + fiber', x: 40, y: 128, w: 150, h: 54, color: '#06b6d4', badge: 'SOURCE',
    detail: ['Downhole gauges · DTS / DAS fiber', 'CO₂ analyzers · vibration', 'Drives GOR / water-cut / CO₂% columns', 'MQTT → Kafka → Auto Loader'] },
  { id: 'co2', label: 'CO₂ Metering', sub: 'injection + recycle', x: 40, y: 192, w: 150, h: 54, color: '#10b981', badge: 'SOURCE',
    detail: ['Coriolis + ultrasonic meters', 'Purchased vs recycled accounting', 'MRV-ready per EPA Subpart RR', 'Feeds 45Q credit reconciliation'] },
  { id: 'market', label: 'Market / Pricing', sub: 'WTI · Henry Hub · 45Q', x: 40, y: 256, w: 150, h: 54, color: '#a855f7', badge: 'SOURCE',
    detail: ['WTI + Henry Hub spot', 'CO₂ contract rates · 45Q valuations', 'REST API · 15-min cadence', 'Drives economics revenue + netback'] },
  { id: 'lab', label: 'Lab / PVT', sub: 'core + fluid analysis', x: 40, y: 320, w: 150, h: 54, color: '#f59e0b', badge: 'SOURCE',
    detail: ['PVT studies + core analysis', 'Relative permeability · CO₂-oil MMP', 'Structured CSVs in UC Volumes', 'Feeds material-balance models'] },
  { id: 'hist', label: 'Field History', sub: 'monthly production', x: 40, y: 384, w: 150, h: 54, color: '#ef4444', badge: 'SOURCE',
    detail: ['Monthly production records', 'Well tests + intervention logs', '760 monthly rows · 16 producers', 'Backfills silver_production_history'] },
]

// ─── Row 2: Medallion (Delta + UC) ──────────────────────────────────────────
const MEDALLION: NodeDef[] = [
  { id: 'loader', label: 'load_data.py', sub: 'ingest + physics', x: 250, y: 210, w: 150, h: 54, color: '#06b6d4', badge: 'LOADER',
    detail: ['Arps decline physics in Python', 'INSERTs Bronze → Silver → Gold', 'Statement-execution API path', 'Prod equivalent: Auto Loader + SDP'] },
  { id: 'bronze', label: 'Bronze', sub: 'raw ingest', x: 250, y: 90, w: 140, h: 54, color: '#cd7f32', badge: 'BRONZE',
    detail: ['bronze_wells · 20 rows (16 prod + 4 inj)', 'bronze_patterns · 4 EOR patterns', 'Append-only · CDF enabled', 'Source for feature pipelines'] },
  { id: 'silver', label: 'Silver', sub: 'features', x: 430, y: 90, w: 140, h: 54, color: '#8E9AAF', badge: 'SILVER',
    detail: ['silver_production_history · 760 rows', 'GOR · water cut · CO₂ concentration', 'silver_economics · 16 wells', 'Revenue · LOE · transport · netback'] },
  { id: 'gold', label: 'Gold Analytics', sub: 'decline · econ · docs', x: 610, y: 90, w: 190, h: 54, color: '#F39C12', badge: 'GOLD',
    detail: ['gold_decline_curves · 16 Arps fits (qi/Di/b/EUR)', 'gold_recommendations · physics actions', 'gold_field_economics · aggregates', 'petroleum_documents · SPE references (RAG)', 'Powers all UI + agent reads'] },
]

// ─── Row 3: Serving / AI ──────────────────────────────────────────────────
const SERVING: NodeDef[] = [
  { id: 'warehouse', label: 'SQL Warehouse', sub: 'serverless', x: 250, y: 320, w: 150, h: 54, color: '#f59e0b', badge: 'COMPUTE',
    detail: ['Serverless · id 87e069097741b56c', '/api/2.0/sql/statements', 'App SP OAuth token', 'All UC reads + writes'] },
  { id: 'genie', label: 'Genie Space', sub: 'Production Optimizer', x: 440, y: 320, w: 160, h: 54, color: '#00E5FF', badge: 'GENIE',
    detail: ['space 01f1559bf073… · NL → SQL', 'Scoped to gold_* + metric views', 'mv_production · mv_economics (ontology)', 'Powers Ask Genie + Field Overview agent'] },
  { id: 'fmapi', label: 'Model · AI Gateway', sub: 'FM API · governed', x: 640, y: 320, w: 170, h: 54, color: '#9254de', badge: 'LLM',
    detail: ['Any of 6 endpoints — Claude Sonnet/Opus/Haiku + GPT-OSS/Llama/Qwen', '/serving-endpoints/{name}/invocations', 'CHOICE: picked in the Supervisor at runtime, no redeploy', 'COST: $/1M-token rate per model · actual usage metered per run', 'GOVERNANCE: Mosaic AI Gateway — PII/safety guardrails, payload logging, rate limits'] },
]

// ─── Row 4: Agents + Application ────────────────────────────────────────────
const APPL: NodeDef[] = [
  { id: 'api', label: 'Express API', sub: 'Node · TypeScript', x: 440, y: 450, w: 160, h: 54, color: '#16A085', badge: 'API',
    detail: ['Routes: production · commercial · twin', 'agent · genie · supervisor · map · shift', 'Node-native Genie + Supervisor (no sidecar)', 'Deployed as a Databricks App'] },
  { id: 'field-agent', label: 'Field Overview', sub: 'Genie family', x: 250, y: 540, w: 150, h: 54, color: '#6366f1', badge: 'AGENT',
    detail: ['/api/agent/query → Genie', 'Selected-asset props prepended', 'Map click drives context', 'Returns NL answer + SQL + rows'] },
  { id: 'supervisor', label: 'Approval Supervisor', sub: 'orchestrator · plans + routes', x: 420, y: 540, w: 180, h: 54, color: '#00E5FF', badge: 'MAS',
    detail: ['1) Planner reasons which specialists the question needs (SSE plan event)', 'Routes to a subset of 5 — Decline · Economics · Rec History · Analog · Ops', 'Engaged specialists run in parallel; skipped ones shown + dimmed', 'Synthesises a verdict from only the engaged findings', 'Choice: model swappable at runtime · Cost: token spend metered per run', 'Governance: AI Gateway guardrails + audit log on every call'] },
  { id: 'ask-genie', label: 'Ask Genie', sub: 'Genie family', x: 620, y: 540, w: 140, h: 54, color: '#6366f1', badge: 'AGENT',
    detail: ['/api/genie/ask · free-form NL → SQL', 'Returns text + SQL + result rows', 'Conversation persistence', 'Direct Genie Space access'] },
  { id: 'scenario', label: 'Scenario Engine', sub: 'Genie family', x: 780, y: 540, w: 150, h: 54, color: '#6366f1', badge: 'AGENT',
    detail: ['/api/production/what-if', 'Per-well physics prediction', 'Choke + injection + price sliders', 'Pre-populated from recommendations'] },
  { id: 'ui', label: 'Operator UI', sub: 'React + Vite', x: 960, y: 450, w: 150, h: 54, color: '#73d13d', badge: 'UI',
    detail: ['Dark theme · 6 tabs + this view', 'MapLibre GL field map + ST_/H3 spatial', 'Canvas + SVG twin · SSE for Supervisor', 'Built static, served by Express'] },
]

const USER: NodeDef = {
  id: 'user', label: 'You', sub: 'operator / SA', x: 1010, y: 96, w: 130, h: 54, color: '#2C3E50', badge: 'USER',
  detail: ['OBO identity forwarded to the app', 'Persona drives UC grants on AI answers', 'Launches Supervisor + Genie queries', 'Runs what-if scenarios'],
}

const EDGES: EdgeDef[] = [
  { from: 'scada',  to: 'bronze', label: 'auto loader', color: '#3b82f6' },
  { from: 'iot',    to: 'bronze', label: 'stream',      color: '#06b6d4', dashed: true },
  { from: 'co2',    to: 'loader', label: 'metering',    color: '#10b981' },
  { from: 'market', to: 'loader', label: 'REST 15-min', color: '#a855f7', dashed: true },
  { from: 'lab',    to: 'loader', label: 'volumes',     color: '#f59e0b', dashed: true },
  { from: 'hist',   to: 'loader', label: 'backfill',    color: '#ef4444' },
  { from: 'loader', to: 'bronze', label: 'insert',      color: '#06b6d4' },
  { from: 'bronze', to: 'silver', label: 'features',    color: '#cd7f32' },
  { from: 'silver', to: 'gold',   label: 'Arps + econ', color: '#8E9AAF' },
  { from: 'gold',   to: 'genie',  label: 'NL→SQL scope', color: '#F39C12', dashed: true },
  { from: 'gold',   to: 'warehouse', label: 'reads',    color: '#F39C12' },
  { from: 'warehouse', to: 'field-agent', label: 'SQL', color: '#f59e0b', dashed: true },
  { from: 'genie',  to: 'ask-genie',  label: 'conversation', color: '#00E5FF' },
  { from: 'genie',  to: 'field-agent', label: 'NL→SQL', color: '#00E5FF', dashed: true },
  { from: 'fmapi',  to: 'supervisor', label: 'synthesise', color: '#9254de' },
  { from: 'supervisor', to: 'genie',  label: 'ops NL→SQL', color: '#00E5FF', dashed: true },
  { from: 'field-agent', to: 'api', label: '',          color: '#6366f1' },
  { from: 'supervisor',  to: 'api', label: '',          color: '#00E5FF' },
  { from: 'ask-genie',   to: 'api', label: '',          color: '#6366f1' },
  { from: 'scenario',    to: 'api', label: '',          color: '#6366f1' },
  { from: 'api',    to: 'ui',   label: 'JSON + SSE',    color: '#16A085' },
  { from: 'ui',     to: 'user', label: 'browser',       color: '#73d13d' },
]

const ALL_NODES: NodeDef[] = [...SOURCES, ...MEDALLION, ...SERVING, ...APPL, USER]
const nodeById = (id: string) => ALL_NODES.find(n => n.id === id)

function arrowPath(e: EdgeDef): string {
  const a = nodeById(e.from); const b = nodeById(e.to)
  if (!a || !b) return ''
  const ay = a.y + a.h / 2, by = b.y + b.h / 2
  if (Math.abs(ay - by) < 10) return `M${a.x + a.w},${ay} L${b.x},${by}`
  const ax = a.x + a.w / 2, bx = b.x + b.w / 2
  if (Math.abs(ax - bx) < 10) return `M${ax},${a.y + a.h} L${bx},${b.y}`
  const midX = (a.x + a.w + b.x) / 2
  return `M${a.x + a.w},${ay} L${midX},${ay} L${midX},${by} L${b.x},${by}`
}

export default function DataAIFlowTab() {
  const [selected, setSelected] = useState<string | null>(null)
  const sel = selected ? nodeById(selected) : null

  return (
    <div style={{ display: 'grid', gap: 16, padding: '0 4px 24px' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>CO₂-EOR Digital Twin · Data &amp; AI Flow</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Click any node to see what it does · orange dashed box = Unity Catalog governance boundary
          </div>
        </div>

        <svg viewBox="0 0 1200 640" style={{ width: '100%', maxWidth: 880, display: 'block', margin: '0 auto', background: 'var(--bg-root)', borderRadius: 6 }}>
          <text x="12"  y="18" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">SOURCES</text>
          <text x="240" y="18" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">MEDALLION · Delta</text>
          <text x="240" y="306" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">SERVING · AI</text>
          <text x="240" y="438" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">AGENTS · orchestration</text>

          <text x="540" y="42" textAnchor="middle" fill="#F39C12" fontSize="11" fontWeight="600" fontFamily="monospace">
            Unity Catalog · governance · grants · metric views · AI Gateway · lineage
          </text>
          <rect x="230" y="50" width="600" height="340" fill="none" stroke="#F39C12" strokeWidth="1" strokeDasharray="6 4" rx="10" opacity="0.85" />

          <defs>
            <marker id="dfArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="#6b7280" />
            </marker>
          </defs>

          {EDGES.map((e, i) => {
            const d = arrowPath(e)
            const col = e.color || '#6b7280'
            return (
              <g key={`edge-${i}`}>
                <path d={d} fill="none" stroke={col} strokeWidth="1.2"
                      strokeDasharray={e.dashed ? '5 4' : 'none'} markerEnd="url(#dfArrow)" opacity="0.85" />
                {e.label && (
                  <text fontSize="9" fill={col} fontFamily="monospace">
                    <textPath href={`#pop-lbl-${i}`} startOffset="42%" textAnchor="middle">{e.label}</textPath>
                  </text>
                )}
                <path id={`pop-lbl-${i}`} d={d} fill="none" stroke="none" />
              </g>
            )
          })}

          {ALL_NODES.map(n => (
            <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(n.id)}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="6"
                    fill="var(--bg-card)" stroke={selected === n.id ? '#00E5FF' : n.color}
                    strokeWidth={selected === n.id ? 2 : 1.2} />
              {n.badge && (
                <>
                  <rect x={n.x + 8} y={n.y + 6} width="58" height="14" rx="3" fill={n.color} opacity="0.25" />
                  <text x={n.x + 37} y={n.y + 16} textAnchor="middle" fill={n.color} fontSize="9" fontFamily="monospace" fontWeight="700">{n.badge}</text>
                </>
              )}
              <text x={n.x + n.w / 2} y={n.y + 35} textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="600">{n.label}</text>
              <text x={n.x + n.w / 2} y={n.y + 48} textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">{n.sub}</text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        {sel ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ padding: '2px 8px', borderRadius: 3, background: sel.color, opacity: 0.85, fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#0d0e11' }}>{sel.badge}</span>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{sel.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {sel.sub}</div>
              <button onClick={() => setSelected(null)} style={{ marginLeft: 'auto', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px', fontSize: 11, cursor: 'pointer' }}>Back to overview</button>
            </div>
            <ul style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 20, lineHeight: 1.7 }}>
              {sel.detail.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>How it works</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { h: '1 · Ingest',      c: 'SCADA, IoT, CO₂ meters, market feeds, lab/PVT, and field history land in Bronze Delta via Auto Loader and load_data.py.', col: '#3b82f6' },
                { h: '2 · Transform',   c: 'Bronze → Silver (GOR, water cut, CO₂%) → Gold. Arps decline physics writes gold_decline_curves; economics rolls up per well and field.', col: '#cd7f32' },
                { h: '3 · Serve',       c: 'Genie owns NL→SQL over the gold tables + metric views (mv_production, mv_economics). The SQL warehouse serves every read.', col: '#00E5FF' },
                { h: '4 · Genie family', c: 'Four agents share the Genie + FM API layer: Field Overview, Ask Genie, Scenario Engine, and the Approval Supervisor — which plans the task, routes to the relevant specialists (of 5), and synthesises a verdict over SSE.', col: '#6366f1' },
                { h: 'Geospatial',      c: 'MapLibre GL field map backed by real spatial SQL — H3 hex density, ST_Contains lease joins, ST_Distance proximity.', col: '#73d13d' },
                { h: 'Governance',      c: 'Unity Catalog grants + metric views govern data and AI alike. Genie runs as the user, so masks apply to AI answers too.', col: '#F39C12' },
                { h: 'AI Gateway',      c: 'Mosaic AI Gateway fronts the FM endpoint: safety + PII guardrails, rate limits, model choice, and usage tracking.', col: '#9254de' },
              ].map(c => (
                <div key={c.h} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderLeft: `3px solid ${c.col}`, borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: c.col, marginBottom: 4 }}>{c.h}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{c.c}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <OntologyView />
    </div>
  )
}

/* ─── Genie Ontology (context graph) — Drilling-matched CSS-var styling ─── */
interface OntCol { name: string; pk?: boolean; fk?: string }
interface OntEntity { table: string; layer: string; cols: OntCol[] }
const ONT_LAYER_COLOR: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#8E9AAF', GOLD: '#F39C12' }
const ONT_ENTITIES: OntEntity[] = [
  { table: 'bronze_patterns', layer: 'BRONZE', cols: [{ name: 'pattern_id', pk: true }, { name: 'current_phase' }, { name: 'target_pressure' }, { name: 'current_pressure' }] },
  { table: 'bronze_wells', layer: 'BRONZE', cols: [{ name: 'well_id', pk: true }, { name: 'pattern_id', fk: 'bronze_patterns' }, { name: 'well_type' }, { name: 'oil_rate' }, { name: 'water_cut' }, { name: 'co2_concentration' }] },
  { table: 'silver_production_history', layer: 'SILVER', cols: [{ name: 'well_id', fk: 'bronze_wells' }, { name: 'production_date' }, { name: 'oil_rate' }, { name: 'gor' }, { name: 'cum_oil' }] },
  { table: 'silver_economics', layer: 'SILVER', cols: [{ name: 'well_id', fk: 'bronze_wells' }, { name: 'netback' }, { name: 'oil_revenue' }, { name: 'loe' }] },
  { table: 'gold_field_economics', layer: 'GOLD', cols: [{ name: 'field_netback' }, { name: 'breakeven' }, { name: 'total_boe' }] },
]
const ONT_METRICS = [
  { name: 'mv_production', desc: 'Oil, gas, water, water cut, GOR, CO₂ by well and month' },
  { name: 'mv_economics', desc: 'Netback and revenue by well' },
]
const ONT_FUNCTIONS = [
  { name: 'f_well_latest_production(well_id)', desc: 'Latest production for one well' },
  { name: 'f_pattern_pressure_status()', desc: 'Reservoir pressure vs target by pattern' },
  { name: 'f_economics_by_pattern()', desc: 'Netback and revenue by flood pattern' },
]

function OntologyView() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Genie Ontology · the context graph</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          The governed semantic layer Genie reads to answer with confidence: entities and relationships,
          canonical metric definitions, and certified functions. It improves as new questions are added.
        </div>
      </div>
      <div style={{ maxHeight: 440, overflowY: 'auto', marginTop: 12, paddingRight: 4 }}>
        <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 8px' }}>Entities &amp; relationships</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {ONT_ENTITIES.map(e => (
            <div key={e.table} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ONT_LAYER_COLOR[e.layer] }} />
                <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{e.table}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: ONT_LAYER_COLOR[e.layer], fontWeight: 700 }}>{e.layer}</span>
              </div>
              <div style={{ padding: '6px 10px' }}>
                {e.cols.map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', padding: '2px 0' }}>
                    <span>{c.name}</span>
                    {c.pk && <span style={{ fontSize: 8.5, color: '#F39C12', border: '1px solid #F39C1255', borderRadius: 3, padding: '0 4px' }}>PK</span>}
                    {c.fk && <span style={{ fontSize: 10, color: '#4dabf7' }}>→ {c.fk}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '18px 0 8px' }}>Metric views · canonical definitions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
          {ONT_METRICS.map(m => (
            <div key={m.name} style={{ background: 'var(--bg-panel)', border: '1px solid #27AE6044', borderLeft: '3px solid #27AE60', borderRadius: 4, padding: '8px 12px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#27AE60' }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{m.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '18px 0 8px' }}>Certified functions · trusted answers</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
          {ONT_FUNCTIONS.map(f => (
            <div key={f.name} style={{ background: 'var(--bg-panel)', border: '1px solid #4dabf744', borderLeft: '3px solid #4dabf7', borderRadius: 4, padding: '8px 12px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700, color: '#4dabf7' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
