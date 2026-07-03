interface Props {
  onNavigate: (tabId: string) => void
}

const SCENE = {
  customer:
    "A Delaware Basin CO₂-EOR operator running a mature unconventional field — multiple producing wells, WAG (water-alternating-gas) injection patterns, CO₂ sourced via pipeline from a regional capture network, and HSE-critical caprock integrity to maintain.",
  today:
    "Injection-pattern decisions are made weekly in spreadsheets. CO₂ accounting is reconciled at audit time, not in real time. Subsurface integrity surveillance — DAS, DTS, microseismic — lives in vendor portals. Production engineers fly blind between weekly committee meetings while $40–80/bbl breakevens swing on ±5% injection efficiency.",
}

const BUSINESS_CASE: { metric: string; label: string }[] = [
  { metric: "±5%", label: "injection efficiency swing = $40–80/bbl breakeven shift" },
  { metric: "2 – 3 weeks", label: "typical lag from observation to pattern change" },
  { metric: "100s / yr", label: "injection pattern decisions per field" },
  { metric: "Caprock", label: "breach = stranded asset + 45Q clawback exposure" },
]

const WHAT_WE_PROVE = [
  "Live geospatial + subsurface picture — wells, patterns, DAS/DTS fiber, microseismic — pulled directly from Delta with Lakebase serving operational state.",
  "Per-well + per-pattern rate recommendations from a Databricks Production Optimizer agent, not a weekly spreadsheet.",
  "Multi-agent Supervisor synthesizes monitoring, economics, integrity, and commercial signals into a cited verdict — APPROVE · CHANGES · DEFER · REJECT.",
  "Any engineer queries the field, patterns, CO₂ balance, and economics in plain English via Databricks Genie — no SQL, no spreadsheets, citations included.",
  "CO₂ accounting + integrity audit trail end-to-end on one platform — Unity Catalog–governed, MLflow-traced. 45Q evidence is built in, not bolted on.",
]

const PLATFORM_PIECES = [
  { name: "Unity Catalog", role: "Single governance plane for every well, pattern, model, vector index, and serving endpoint." },
  { name: "Auto Loader", role: "Streaming ingest of SCADA, DAS, DTS, and microseismic feeds into Bronze Delta." },
  { name: "Lakeflow Declarative Pipelines", role: "Bronze → Silver → Gold for rates, pressures, CO₂ balance, integrity events." },
  { name: "Mosaic AI Model Serving", role: "Hosts the Production Optimizer agent and Supervisor specialists behind one auth boundary." },
  { name: "Foundation Model APIs", role: "Frontier LLMs for the Supervisor and Genie synthesis — no key management, no data leaving Databricks." },
  { name: "Mosaic AI Vector Search", role: "RAG over analog field reports, WAG playbooks, and integrity intervention manuals." },
  { name: "Genie", role: "Natural-language to governed SQL across wells, patterns, CO₂ balance, and economics." },
  { name: "Lakebase", role: "Low-latency operational state for field map, asset status, and live KPI tickers." },
  { name: "MLflow", role: "Tracing every optimizer recommendation, supervisor decision, and Genie query." },
]

interface Step {
  num: number
  title: string
  tabId: string
  tab: string
  duration: string
  talk: string
  pointAt: string[]
  features: string[]
}

const STEPS: Step[] = [
  {
    num: 1, title: "Set the scene — the field operational picture", tabId: "field", tab: "Field Overview", duration: "45s",
    talk: "We're looking at a live geospatial picture of a CO₂-EOR field — producers, WAG injectors, pipelines, facilities, CO₂ sources, monitoring fiber, fleet vehicles. Toggle the H3 density and CO₂ plume layers: those are real Databricks GA spatial SQL — h3_longlatash3 hexagons and ST_Contains plume-front joins running on the warehouse. Open the 'Spatial SQL · GA' panel to see the actual queries.",
    pointAt: ["MapLibre basemap with custom asset icons", "H3 density hexes (toggle) — real h3_longlatash3", "CO₂ plume polygons (toggle) — ST_Contains front producers", "Spatial SQL · GA panel showing the live H3/ST_ queries"],
    features: ["H3 + ST_ (GA)", "Lakebase", "Delta tables"],
  },
  {
    num: 2, title: "Open the digital twin", tabId: "twin", tab: "Digital Twin", duration: "45s",
    talk: "Click any asset and you get the operations twin — a live P&ID with flow rates, pressures, equipment health, and CO₂ phase state. Producers, injectors, separators, compressors, the CO₂ source. Bronze→Silver→Gold telemetry rendered as a flowing schematic.",
    pointAt: ["Live P&ID schematic with flow + pressure animation", "Equipment health states (green / amber / red)", "CO₂ phase tracking (supercritical / gas / liquid)", "Per-asset deep-dive panel"],
    features: ["Auto Loader", "Lakeflow", "Delta"],
  },
  {
    num: 3, title: "Show the Production Optimizer recommendations", tabId: "optimizer", tab: "Production Optimizer", duration: "60s",
    talk: "Now the AI. The Production Optimizer agent runs on Databricks Foundation Model APIs and Mosaic AI Model Serving. It recommends per-well rate changes and per-pattern WAG ratio adjustments, with an economic delta on every recommendation. The engineer accepts, modifies, or defers — every decision audited.",
    pointAt: ["Per-well rate recommendations with reason codes", "Per-pattern WAG ratio + injection rate suggestions", "Economic delta ($/day) per recommendation", "Accept / Modify / Defer with audit log"],
    features: ["Foundation Model APIs", "Mosaic AI Model Serving", "MLflow Tracing"],
  },
  {
    num: 4, title: "Let the operator ask questions", tabId: "genie", tab: "Ask Genie", duration: "60s",
    talk: "Databricks Genie sits on the Gold tables. The operator asks in plain English — 'which pattern has the highest CO₂ utilization this month?', 'show me wells where BHP dropped more than 200 psi last week' — and Genie returns governed SQL, results, and citations. No SQL skills required.",
    pointAt: ["Natural-language prompt box", "Suggested CO₂-EOR questions", "Inline governed SQL + result table", "Citation back to the Delta table"],
    features: ["Genie", "Unity Catalog", "SQL warehouse"],
  },
  {
    num: 5, title: "Let the Supervisor decide", tabId: "supervisor", tab: "Supervisor", duration: "60s",
    talk: "When the operator wants a multi-factor decision, the Supervisor fans out to specialists in parallel and synthesizes a cited verdict. First — the CHOICE · MODEL bar: pick the model (Claude Sonnet 4.5, Opus 4.8, or open-weight GPT-OSS / Llama / Qwen). It re-routes the Supervisor's calls live, governed by Mosaic AI Gateway — no code change. The verdict shows which model ran. That's Control, Cost & Choice.",
    pointAt: ["CHOICE · MODEL picker — swap Claude ↔ open models live", "Specialist cards filling in parallel", "Verdict badge + the model that produced it", "APPROVE / CHANGES / DEFER / REJECT with cited evidence"],
    features: ["Model choice (AI Gateway)", "Foundation Model APIs", "Vector Search"],
  },
  {
    num: 6, title: "Show how it's built", tabId: "dataflow", tab: "Data & AI Flow", duration: "60s",
    talk: "Here's the whole Databricks stack. Auto Loader pulls SCADA, DAS, DTS into Bronze. Lakeflow Declarative Pipelines stream Silver and Gold. Mosaic AI Vector Search powers the analog/playbook RAG. Mosaic AI Model Serving hosts the Optimizer and Supervisor agents behind Foundation Model APIs. Lakebase serves operational state. Unity Catalog governs every table, model, vector index, and endpoint. One platform, one governance model, zero glue code.",
    pointAt: ["Data flow: SCADA + DAS + DTS → Bronze → Silver → Gold → agents", "Unity Catalog governance overlay", "Mosaic AI Model Serving + Vector Search", "Lakebase + Delta Sharing for ops + JV partners"],
    features: ["Unity Catalog", "Lakeflow", "Mosaic AI", "Lakebase"],
  },
]

const CLOSING_PIVOTS = [
  { audience: "Operations / Engineering", pitch: "Live picture across surface and subsurface. Per-well, per-pattern recommendations in seconds, not weekly. Caprock integrity continuously surveilled." },
  { audience: "HSE / Compliance", pitch: "45Q evidence is built in. Every supervisor verdict, every CO₂ balance entry, every integrity event logged in MLflow + Gold Delta with full audit trail." },
  { audience: "Data / Platform", pitch: "One Databricks platform: Auto Loader, Lakeflow, Delta, Mosaic AI Model Serving + Vector Search, Genie, Lakebase, all under Unity Catalog. No glue code, no separate ML stack." },
]

export default function DemoGuideTab({ onNavigate }: Props) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 4px 32px', color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
          <h1 style={{ color: 'var(--accent)', margin: 0, fontSize: 22, fontWeight: 700 }}>Demo Guide</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>~6 min · 6 steps</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55, margin: 0, maxWidth: 800 }}>
          A point-and-click script for running the Production Optimizer demo end-to-end. Read the talk track, click{' '}
          <strong style={{ color: 'var(--accent)' }}>Open {'<tab>'}</strong> to deep-link into the right view, deliver the moment, then come back here for the next step.
        </p>
      </div>

      <Panel label="THE SCENE" labelColor="var(--accent)">
        <div style={{ color: 'var(--text-secondary)', fontSize: 11.5, lineHeight: 1.65, marginBottom: 10 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Customer.</strong> {SCENE.customer}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 11.5, lineHeight: 1.65 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Today.</strong> {SCENE.today}
        </div>
      </Panel>

      <Panel label="THE BUSINESS CASE" labelColor="var(--warning)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {BUSINESS_CASE.map(b => (
            <div key={b.label} style={{ background: 'var(--bg-root)', border: '1px solid var(--warning-dim)', borderRadius: 6, padding: 12 }}>
              <div style={{ color: 'var(--warning)', fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{b.metric}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 10.5, lineHeight: 1.4 }}>{b.label}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel label="WHAT WE'LL PROVE" labelColor="var(--accent)">
        <ol style={{ color: 'var(--text-secondary)', fontSize: 11.5, lineHeight: 1.65, margin: 0, paddingLeft: 20 }}>
          {WHAT_WE_PROVE.map(p => <li key={p} style={{ marginBottom: 6 }}>{p}</li>)}
        </ol>
      </Panel>

      <Panel label="THE DATABRICKS STORY — ONE PLATFORM, NINE PIECES" labelColor="#FF3621" lastInGroup>
        <div style={{ color: 'var(--text-muted)', fontSize: 10.5, marginBottom: 12 }}>
          Every box below is real Databricks product, wired together, governed end-to-end. Name them as they come up.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
          {PLATFORM_PIECES.map(p => (
            <div key={p.name} style={{ background: 'var(--bg-root)', border: '1px solid #FF362144', borderRadius: 6, padding: 10 }}>
              <div style={{ color: '#fb923c', fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{p.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 10.5, lineHeight: 1.5 }}>{p.role}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, marginBottom: 12, paddingLeft: 4 }}>
        ───── THE WALKTHROUGH ─────
      </div>

      {STEPS.map(step => (
        <StepCard key={step.num} step={step} onOpen={() => onNavigate(step.tabId)} />
      ))}

      <div style={{ marginTop: 18 }}>
        <Panel label="CLOSING — PICK YOUR LANDING" labelColor="var(--accent)">
          <p style={{ color: 'var(--text-muted)', fontSize: 10.5, margin: '0 0 12px 0' }}>End on the pivot that matches who's in the room:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {CLOSING_PIVOTS.map(p => (
              <div key={p.audience} style={{ background: 'var(--bg-root)', border: '1px solid var(--border)', borderRadius: 6, padding: 13 }}>
                <div style={{ color: 'var(--accent)', fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>{p.audience}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, lineHeight: 1.55 }}>{p.pitch}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      </div>
    </div>
  )
}

function Panel({ label, labelColor, children, lastInGroup }: { label: string; labelColor: string; children: any; lastInGroup?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 16,
      marginBottom: lastInGroup ? 22 : 12,
    }}>
      <div style={{ color: labelColor, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  )
}

function StepCard({ step, onOpen }: { step: Step; onOpen: () => void }) {
  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 18,
      marginBottom: 12,
      display: 'grid',
      gridTemplateColumns: '40px 1fr 130px',
      gap: 14,
      alignItems: 'start',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: 'var(--accent-dim)', border: '2px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 700, color: 'var(--accent)',
      }}>{step.num}</div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 14, fontWeight: 600 }}>{step.title}</h3>
          <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>~ {step.duration}</span>
        </div>

        <div style={{
          background: 'var(--bg-root)', borderLeft: '3px solid var(--accent)',
          padding: '9px 13px', borderRadius: 4, marginBottom: 11,
          color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.55, fontStyle: 'italic',
        }}>"{step.talk}"</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>POINT AT</div>
            <ul style={{ color: 'var(--text-secondary)', fontSize: 10.5, lineHeight: 1.55, margin: 0, paddingLeft: 15 }}>
              {step.pointAt.map(p => <li key={p}>{p}</li>)}
            </ul>
          </div>
          <div>
            <div style={{ color: '#fb923c', fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>DATABRICKS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {step.features.map(f => (
                <span key={f} style={{
                  background: '#FF362118', border: '1px solid #FF362144', color: '#fb923c',
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                }}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button onClick={onOpen} style={{
        background: 'var(--accent)', color: 'var(--bg-root)', border: 'none',
        padding: '9px 13px', borderRadius: 6, fontSize: 11, fontWeight: 700,
        cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'start',
      }}>Open {step.tab} →</button>
    </div>
  )
}
