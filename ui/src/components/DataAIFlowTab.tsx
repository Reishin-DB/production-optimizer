import { useState } from 'react';

/* ================================================================
   Production Optimizer — Data & AI Flow Diagram
   Matches the actual app: Sources → Medallion → Physics Engine → Serving
   ================================================================ */

const W = 1100;
const H = 500;

const SRC_Y = 55;
const BRONZE_Y = 155;
const SILVER_Y = 245;
const GOLD_Y = 335;
const SERVE_Y = 435;

interface Node {
  id: string; label: string; x: number; y: number;
  w: number; h: number; color: string; icon: string; detail: string;
}

interface Edge {
  from: string; to: string; color: string; dashed?: boolean;
}

const nodes: Node[] = [
  // --- Sources ---
  { id: 'scada', label: 'SCADA / RTU', x: 60, y: SRC_Y, w: 120, h: 38, color: '#3b82f6', icon: '📡',
    detail: 'Real-time well & facility telemetry — pressures, temperatures, flow rates, valve positions. 1-second polling via OPC-UA / Modbus TCP.' },
  { id: 'iot', label: 'IoT Sensors', x: 200, y: SRC_Y, w: 120, h: 38, color: '#06b6d4', icon: '🌡️',
    detail: 'Downhole gauges, fiber-optic DTS/DAS, CO₂ concentration analyzers, vibration sensors. Streams via MQTT → Kafka.' },
  { id: 'co2meter', label: 'CO₂ Metering', x: 340, y: SRC_Y, w: 130, h: 38, color: '#00d4aa', icon: '⚗️',
    detail: 'Coriolis & ultrasonic flow meters on injection/production headers. Tracks purchased vs recycled CO₂ for carbon accounting.' },
  { id: 'market', label: 'Market / Pricing', x: 490, y: SRC_Y, w: 130, h: 38, color: '#a855f7', icon: '📈',
    detail: 'WTI/Henry Hub spot prices, CO₂ contract rates, 45Q credit valuations. REST API ingestion every 15 min.' },
  { id: 'lab', label: 'Lab / PVT', x: 640, y: SRC_Y, w: 110, h: 38, color: '#f59e0b', icon: '🧪',
    detail: 'PVT studies, core analysis, relative permeability, CO₂-oil MMP tests. Structured CSVs to Unity Catalog volumes.' },
  { id: 'hist', label: 'Production History', x: 770, y: SRC_Y, w: 150, h: 38, color: '#ef4444', icon: '📊',
    detail: 'Monthly production allocations, well tests, decline curve histories. State regulatory filings (TX RRC, NM OCD).' },

  // --- Bronze ---
  { id: 'bronze_ops', label: 'bronze.ops_raw', x: 100, y: BRONZE_Y, w: 150, h: 38, color: '#cd7f32', icon: '🥉',
    detail: 'Raw operational data — SCADA snapshots, IoT events, meter readings. Append-only Delta tables with Autoloader ingestion.' },
  { id: 'bronze_co2', label: 'bronze.co2_raw', x: 300, y: BRONZE_Y, w: 150, h: 38, color: '#cd7f32', icon: '🥉',
    detail: 'Raw CO₂ metering, injection volumes, recycled gas compositions. Immutable landing zone for carbon audit trail.' },
  { id: 'bronze_market', label: 'bronze.market', x: 500, y: BRONZE_Y, w: 140, h: 38, color: '#cd7f32', icon: '🥉',
    detail: 'Market prices, contract terms, transport tariffs. Daily batch + 15-min streaming for spot prices.' },
  { id: 'bronze_prod', label: 'bronze.production', x: 700, y: BRONZE_Y, w: 160, h: 38, color: '#cd7f32', icon: '🥉',
    detail: 'Historical production records, well test data, lab results. Monthly grain from regulatory sources.' },

  // --- Silver ---
  { id: 'silver_wells', label: 'silver.wells', x: 80, y: SILVER_Y, w: 140, h: 38, color: '#c0c0c0', icon: '🥈',
    detail: 'Cleaned well-level production/injection allocations. Normalized pressures, validated tests, Arps decline parameters. Hourly grain.' },
  { id: 'silver_patterns', label: 'silver.patterns', x: 260, y: SILVER_Y, w: 150, h: 38, color: '#c0c0c0', icon: '🥈',
    detail: 'Injection pattern aggregates — WAG cycle tracking, cumulative CO₂ slugs, breakthrough indicators, pattern-level VRR.' },
  { id: 'silver_econ', label: 'silver.economics', x: 450, y: SILVER_Y, w: 160, h: 38, color: '#c0c0c0', icon: '🥈',
    detail: 'Well-level netback, LOE allocation, CO₂ cost per BOE, transport tariffs, 45Q credit accruals.' },
  { id: 'silver_carbon', label: 'silver.carbon', x: 650, y: SILVER_Y, w: 150, h: 38, color: '#c0c0c0', icon: '🥈',
    detail: 'CO₂ mass balance — purchased, injected, recycled, stored, emitted. MRV-ready per EPA Subpart RR.' },

  // --- Gold + Physics Engine ---
  { id: 'gold_twin', label: 'gold.digital_twin', x: 70, y: GOLD_Y, w: 160, h: 38, color: '#ffd700', icon: '🥇',
    detail: 'Unified digital twin state — real-time snapshot of all wells, patterns, facilities. Materialized view refreshed every 30s.' },
  { id: 'physics', label: 'Physics Engine', x: 270, y: GOLD_Y, w: 150, h: 38, color: '#00d4aa', icon: '⚙️',
    detail: 'Arps decline curves (hyperbolic/exponential), Darcy flow injectivity, material balance, Buckley-Leverett water cut. Runs against Silver data to generate recommendations.' },
  { id: 'gold_econ', label: 'gold.field_economics', x: 460, y: GOLD_Y, w: 170, h: 38, color: '#ffd700', icon: '🥇',
    detail: 'Field-level economics — revenue, opex, CO₂ cost, netback, breakeven, carbon credit revenue. Powers the optimizer economics bar.' },
  { id: 'agent', label: 'Optimization Agent', x: 670, y: GOLD_Y, w: 170, h: 38, color: '#ef4444', icon: '🤖',
    detail: 'Physics-driven recommendation engine. Analyzes well performance gaps, pressure deficits, CO₂ breakthrough, water cut trends. Generates ranked actions with $ impact.' },

  // --- Serving ---
  { id: 'serve_field', label: 'Field Overview', x: 60, y: SERVE_Y, w: 130, h: 36, color: '#3b82f6', icon: '🗺️',
    detail: 'Geospatial map with wells, facilities, pipelines color-coded by status. Canvas renderer with pan/zoom.' },
  { id: 'serve_twin', label: 'Digital Twin', x: 220, y: SERVE_Y, w: 130, h: 36, color: '#06b6d4', icon: '🏭',
    detail: 'P&ID schematic with live equipment status, flow readouts, health indicators. Interactive SVG.' },
  { id: 'serve_actions', label: 'Actions', x: 380, y: SERVE_Y, w: 110, h: 36, color: '#00d4aa', icon: '⚡',
    detail: 'Agent-generated recommendations ranked by $ impact. Each action shows physics rationale, risk assessment, and affected wells.' },
  { id: 'serve_deepdive', label: 'Deep Dive', x: 520, y: SERVE_Y, w: 120, h: 36, color: '#f59e0b', icon: '🔬',
    detail: 'Full well analytics — decline curves, multi-stream production (oil/gas/water), pressures, CO₂ concentration, health scores.' },
  { id: 'serve_scenario', label: 'Scenario', x: 670, y: SERVE_Y, w: 120, h: 36, color: '#a855f7', icon: '🎛️',
    detail: 'What-if simulator. Pick a recommendation, adjust parameters, see per-well production and economic impact using Darcy flow physics.' },
  { id: 'serve_api', label: 'REST API', x: 820, y: SERVE_Y, w: 110, h: 36, color: '#8b5cf6', icon: '🔌',
    detail: 'Express.js API serving twin state, decline curves, what-if scenarios, recommendations, field economics. RBAC-protected.' },
];

const edges: Edge[] = [
  // Sources → Bronze
  { from: 'scada', to: 'bronze_ops', color: '#3b82f6' },
  { from: 'iot', to: 'bronze_ops', color: '#06b6d4' },
  { from: 'co2meter', to: 'bronze_co2', color: '#00d4aa' },
  { from: 'market', to: 'bronze_market', color: '#a855f7' },
  { from: 'lab', to: 'bronze_prod', color: '#f59e0b' },
  { from: 'hist', to: 'bronze_prod', color: '#ef4444' },

  // Bronze → Silver
  { from: 'bronze_ops', to: 'silver_wells', color: '#cd7f32' },
  { from: 'bronze_ops', to: 'silver_patterns', color: '#cd7f32' },
  { from: 'bronze_co2', to: 'silver_carbon', color: '#cd7f32' },
  { from: 'bronze_co2', to: 'silver_patterns', color: '#cd7f32' },
  { from: 'bronze_market', to: 'silver_econ', color: '#cd7f32' },
  { from: 'bronze_prod', to: 'silver_wells', color: '#cd7f32' },

  // Silver → Gold + Physics
  { from: 'silver_wells', to: 'gold_twin', color: '#c0c0c0' },
  { from: 'silver_patterns', to: 'gold_twin', color: '#c0c0c0' },
  { from: 'silver_wells', to: 'physics', color: '#c0c0c0' },
  { from: 'silver_patterns', to: 'physics', color: '#c0c0c0' },
  { from: 'silver_econ', to: 'gold_econ', color: '#c0c0c0' },
  { from: 'silver_carbon', to: 'gold_econ', color: '#c0c0c0' },

  // Physics → Agent
  { from: 'physics', to: 'agent', color: '#00d4aa', dashed: true },
  { from: 'gold_econ', to: 'agent', color: '#ffd700', dashed: true },
  { from: 'gold_twin', to: 'agent', color: '#ffd700', dashed: true },

  // Gold → Serving
  { from: 'gold_twin', to: 'serve_field', color: '#ffd700' },
  { from: 'gold_twin', to: 'serve_twin', color: '#ffd700' },
  { from: 'agent', to: 'serve_actions', color: '#ef4444', dashed: true },
  { from: 'physics', to: 'serve_deepdive', color: '#00d4aa' },
  { from: 'agent', to: 'serve_scenario', color: '#ef4444', dashed: true },
  { from: 'gold_econ', to: 'serve_scenario', color: '#ffd700' },
  { from: 'gold_twin', to: 'serve_api', color: '#ffd700' },
];

const nodeMap = new Map(nodes.map((n) => [n.id, n]));

function getEdgePath(e: Edge): string {
  const from = nodeMap.get(e.from);
  const to = nodeMap.get(e.to);
  if (!from || !to) return '';
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export default function DataAIFlowTab() {
  const [selected, setSelected] = useState<Node | null>(null);

  return (
    <div className="flow-tab-layout">
      <div className="flow-svg-container">
        <svg viewBox={`0 0 ${W} ${H}`} className="flow-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <style>{`
              .flow-edge { fill: none; stroke-width: 1.2; opacity: 0.3; }
              .flow-edge-anim { fill: none; stroke-width: 1.6; stroke-dasharray: 6 4; animation: fd 1.8s linear infinite; }
              .flow-edge-dashed { stroke-dasharray: 4 3; }
              @keyframes fd { to { stroke-dashoffset: -20; } }
            `}</style>
          </defs>

          {/* Row Labels */}
          <text x="14" y={SRC_Y - 8} className="flow-row-label">SOURCES</text>
          <text x="14" y={BRONZE_Y - 8} className="flow-row-label">BRONZE</text>
          <text x="14" y={SILVER_Y - 8} className="flow-row-label">SILVER</text>
          <text x="14" y={GOLD_Y - 8} className="flow-row-label">GOLD · PHYSICS · AGENT</text>
          <text x="14" y={SERVE_Y - 8} className="flow-row-label">SERVING</text>

          {/* Unity Catalog box */}
          <rect x="30" y={BRONZE_Y - 20} width={W - 60} height={GOLD_Y + 56 - BRONZE_Y + 20}
            rx="8" fill="none" stroke="#f97316" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.3" />
          <text x={W - 30} y={BRONZE_Y - 4} fill="#f97316" fontSize="9" fontWeight="600"
            opacity="0.5" textAnchor="end" style={{ fontFamily: 'monospace' }}>Unity Catalog</text>

          {/* Edges (static) */}
          {edges.map((e, i) => (
            <path key={`bg-${i}`} d={getEdgePath(e)}
              className={`flow-edge ${e.dashed ? 'flow-edge-dashed' : ''}`} stroke={e.color} />
          ))}
          {/* Edges (animated) */}
          {edges.map((e, i) => (
            <path key={`fg-${i}`} d={getEdgePath(e)} className="flow-edge-anim" stroke={e.color} opacity="0.65" />
          ))}

          {/* Nodes */}
          {nodes.map((n) => {
            const isSel = selected?.id === n.id;
            return (
              <g key={n.id} onClick={() => setSelected(isSel ? null : n)} style={{ cursor: 'pointer' }}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="6"
                  fill={isSel ? n.color : '#161b22'} stroke={n.color}
                  strokeWidth={isSel ? 2 : 1.2} opacity={isSel ? 1 : 0.9} />
                <text x={n.x + 8} y={n.y + n.h / 2 + 1}
                  fill={isSel ? '#0f1117' : '#e6edf3'} fontSize="10.5" fontWeight="500"
                  dominantBaseline="middle"
                  style={{ fontFamily: '-apple-system, sans-serif', pointerEvents: 'none' }}>
                  {n.icon} {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detail Panel */}
      <div className="flow-detail-panel">
        {selected ? (
          <div className="flow-detail-card">
            <div className="flow-detail-header">
              <span className="flow-detail-icon">{selected.icon}</span>
              <span className="flow-detail-title">{selected.label}</span>
              <span className="flow-detail-badge"
                style={{ background: selected.color + '22', color: selected.color, borderColor: selected.color + '44' }}>
                {selected.y === SRC_Y ? 'Source' :
                 selected.y === BRONZE_Y ? 'Bronze' :
                 selected.y === SILVER_Y ? 'Silver' :
                 selected.id === 'physics' ? 'Physics Engine' :
                 selected.id === 'agent' ? 'AI Agent' :
                 selected.id.startsWith('gold') ? 'Gold' : 'Serving'}
              </span>
            </div>
            <div className="flow-detail-body">{selected.detail}</div>
          </div>
        ) : (
          <div className="flow-how-it-works">
            <div className="flow-how-header">How It Works</div>
            <div className="flow-how-cards">
              <HowCard icon="📡" title="Ingest" color="#3b82f6"
                text="SCADA, IoT, CO₂ meters, market feeds, and production history stream into Bronze Delta tables via Autoloader." />
              <HowCard icon="⚙️" title="Refine" color="#c0c0c0"
                text="DLT pipelines clean and aggregate through Silver (wells, patterns, economics, carbon) to Gold (digital twin, field economics)." />
              <HowCard icon="🧮" title="Physics" color="#00d4aa"
                text="Arps decline curves, Darcy flow, material balance, and Buckley-Leverett models run against Silver data to fit parameters and detect underperformance." />
              <HowCard icon="🤖" title="Optimize" color="#ef4444"
                text="Agent analyzes physics output + economics to generate ranked recommendations with $ impact. Feeds the Actions, Deep Dive, and Scenario views." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HowCard({ icon, title, text, color }: { icon: string; title: string; text: string; color: string }) {
  return (
    <div className="flow-how-card" style={{ borderTopColor: color }}>
      <div className="flow-how-card-icon">{icon}</div>
      <div className="flow-how-card-title">{title}</div>
      <div className="flow-how-card-text">{text}</div>
    </div>
  );
}
