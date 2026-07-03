import { useState } from 'react';
import GeospatialTab from './components/GeospatialTab';
import DataAIFlowTab from './components/DataAIFlowTab';
import DigitalTwinTab from './components/DigitalTwinTab';
import ProductionOptimizerTab from './components/ProductionOptimizerTab';
import AskGeniePage from './components/AskGeniePage';
import SupervisorTab from './components/SupervisorTab';
import DemoGuideTab from './components/DemoGuideTab';

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export interface Alert {
  id: string | number;
  message: string;
  severity: string;
  timestamp: string;
  acknowledged?: boolean;
}

export interface KPI {
  label: string;
  value: string | number;
  unit: string;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'demo', label: '▶ Demo Guide', step: undefined as number | undefined },
  { id: 'field', label: 'Field Overview', step: 1 },
  { id: 'twin', label: 'Digital Twin', step: 2 },
  { id: 'optimizer', label: 'Production Optimizer', step: 3 },
  { id: 'genie', label: '✨ Ask Genie', step: 4 },
  { id: 'supervisor', label: '🧠 Supervisor', step: 5 },
  { id: 'dataflow', label: 'Data & AI Flow', step: 6 },
] as const;

type TabId = (typeof TABS)[number]['id'];

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('demo');

  /* ---------------------------------------------------------------- */
  /*  Render tab content                                               */
  /* ---------------------------------------------------------------- */
  function renderTab() {
    switch (activeTab) {
      case 'demo':
        return <DemoGuideTab onNavigate={(id) => setActiveTab(id as TabId)} />;
      case 'field':
        return <GeospatialTab />;
      case 'twin':
        return <DigitalTwinTab />;
      case 'optimizer':
        return <ProductionOptimizerTab />;
      case 'genie':
        return <AskGeniePage />;
      case 'supervisor':
        return <SupervisorTab />;
      case 'dataflow':
        return <DataAIFlowTab />;
      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  JSX                                                              */
  /* ---------------------------------------------------------------- */
  return (
    <div className="app-layout">
      {/* ---------- Header ---------- */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">PO</div>
          <span className="header-title">Production Optimizer</span>
        </div>
        <span className="env-badge">LIVE</span>
        <div className="header-spacer" />
      </header>

      {/* ---------- Tab Bar ---------- */}
      <nav className="tab-bar">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {tab.step !== undefined && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: '50%',
                  background: isActive ? 'var(--accent)' : 'var(--border)',
                  color: isActive ? 'var(--bg-root)' : 'var(--text-muted)',
                  fontSize: 10, fontWeight: 700,
                }}>{tab.step}</span>
              )}
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ---------- Active Tab ---------- */}
      <div className="main-content">{renderTab()}</div>
    </div>
  );
}
