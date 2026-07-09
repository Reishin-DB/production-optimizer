import { useState, useEffect, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'thinking' | 'busy' | 'error';
}

export interface Proposal {
  id: string;
  agentRole: string;
  description: string;
  impact?: string;
  risk?: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected';
}

interface GenieResponse {
  text?: string;
  rows?: unknown[][];
  columns?: string[];
  error?: string;
}

interface FeatureProperties {
  [key: string]: unknown;
}

/* Prepared questions for the Field Overview Genie sidebar.
   Includes geospatial / Spatial SQL questions (H3 cells, ST_Distance proximity)
   that Genie answers against well_locations + well_h3_density in Unity Catalog. */
const FIELD_QUESTIONS = [
  'How many wells are in each H3 cell?',
  'Which wells are within 2 km of W-A01?',
  'Top 5 wells by oil rate',
  'Which wells have the highest water cut?',
  'CO₂ injection vs recycle by pattern',
  'Field netback and breakeven',
];

interface Props {
  selectedFeature: FeatureProperties | null;
  featureType?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ROLE_CLASS: Record<string, string> = {
  reservoir: 'reservoir',
  production: 'production',
  environmental: 'environmental',
  commercial: 'commercial',
  safety: 'safety',
  logistics: 'logistics',
};

function roleClass(role: string): string {
  const lower = role.toLowerCase();
  for (const key of Object.keys(ROLE_CLASS)) {
    if (lower.includes(key)) return ROLE_CLASS[key];
  }
  return '';
}

/** Keys to hide from the properties panel. */
const HIDDEN_KEYS = new Set(['color', 'geometry', 'layerType', '_vectorTileFeature']);

function formatPropValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentPanel({ selectedFeature, featureType }: Props) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<GenieResponse | null>(null);
  const [conv, setConv] = useState<string | null>(null);

  /* Fetch agents & proposals */
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/twin/agents');
      if (!res.ok) return;
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : data.agents ?? []);
    } catch {
      /* silent */
    }
  }, []);

  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/proposals');
      if (!res.ok) return;
      const data = await res.json();
      const list: Proposal[] = Array.isArray(data) ? data : data.proposals ?? [];
      setProposals(list.filter((p) => p.status === 'pending'));
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchProposals();
    const iv = setInterval(() => {
      fetchAgents();
      fetchProposals();
    }, 10_000);
    return () => clearInterval(iv);
  }, [fetchAgents, fetchProposals]);

  /* Submit question to Genie (NL → governed SQL over the UC gold tables). */
  async function ask(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setQuery(q);
    setSending(true);
    setResponse(null);
    // If a map feature is selected, scope the question to it.
    let question = q;
    if (selectedFeature && (selectedFeature.id || selectedFeature.name)) {
      question = `For ${selectedFeature.id || selectedFeature.name}: ${q}`;
    }
    try {
      const res = await fetch('/api/genie/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation_id: conv }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setResponse({ error: data.error || `HTTP ${res.status}` });
      } else {
        setConv(data.conversation_id || conv);
        setResponse({ text: data.text, rows: data.rows, columns: data.columns });
      }
    } catch (err) {
      setResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSending(false);
    }
  }

  /* Approve / Reject */
  async function handleProposalAction(id: string, action: 'approve' | 'reject') {
    try {
      await fetch(`/api/agent/proposal/${id}/${action}`, { method: 'POST' });
      setProposals((prev) => prev.filter((p) => p.id !== id));
    } catch {
      /* silent */
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <>
      {/* --- Feature Properties --- */}
      <div className="panel-section">
        <div className="panel-section-header">
          <span>Selected Asset</span>
          {featureType && (
            <span className={`feature-type-badge ${featureType}`}>{featureType}</span>
          )}
        </div>
        <div className="panel-section-body">
          {selectedFeature ? (
            <div className="feature-props">
              {Object.entries(selectedFeature)
                .filter(([k]) => !HIDDEN_KEYS.has(k))
                .map(([key, val]) => (
                  <div className="feature-prop-row" key={key}>
                    <span className="feature-prop-key">{key}</span>
                    <span className="feature-prop-value">{formatPropValue(val)}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="no-selection">Click a map feature to inspect</div>
          )}
        </div>
      </div>

      {/* --- Agent Status --- */}
      <div className="panel-section">
        <div className="panel-section-header">Agents</div>
        <div className="panel-section-body">
          <div className="agent-chips">
            {agents.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                No agents connected
              </span>
            )}
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`agent-chip ${roleClass(agent.role)}`}
                title={`${agent.name} — ${agent.status}`}
              >
                <span className={`status-dot ${agent.status}`} />
                <span>{agent.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- Ask Genie --- */}
      <div className="panel-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-section-header">
          <span>✨ Ask Genie</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9,
            color: '#67e8f9', border: '1px solid #06b6d444', borderRadius: 8, padding: '1px 6px',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 3, background: '#22c55e' }} />
            UC governed
          </span>
        </div>
        <div className="panel-section-body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Prepared questions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {FIELD_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={sending}
                style={{
                  fontSize: 10.5, padding: '4px 8px', borderRadius: 12,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', cursor: sending ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                }}
              >{q}</button>
            ))}
          </div>

          <div className="agent-query-area" style={{ flex: 1 }}>
            <textarea
              className="agent-textarea"
              placeholder="Ask Genie about wells, decline curves, CO&#x2082; balance, economics, or well spacing &amp; H3 density (Spatial SQL)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(query);
              }}
            />
            <button
              className="agent-send-btn"
              disabled={!query.trim() || sending}
              onClick={() => ask(query)}
            >
              {sending ? 'Genie is reasoning…' : 'Ask Genie'}
            </button>

            {response && (
              <div className="agent-response">
                {response.error ? (
                  <div className="agent-response-text" style={{ color: '#fca5a5' }}>⚠️ {response.error}</div>
                ) : (
                  <>
                    {response.text && (
                      <div className="agent-response-text" style={{ whiteSpace: 'pre-wrap' }}>{response.text}</div>
                    )}
                    {response.columns && response.columns.length > 0 && response.rows && response.rows.length > 0 && (
                      <div style={{ overflowX: 'auto', marginTop: 8 }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%' }}>
                          <thead>
                            <tr>
                              {response.columns.map((c, i) => (
                                <th key={i} style={{
                                  background: 'var(--bg-card)', color: 'var(--text-muted)',
                                  padding: '4px 7px', border: '1px solid var(--border)', textAlign: 'left',
                                }}>{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {response.rows.slice(0, 12).map((r, i) => (
                              <tr key={i}>
                                {r.map((v, j) => (
                                  <td key={j} style={{ padding: '3px 7px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                    {v == null ? '' : String(v).slice(0, 40)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {response.rows.length > 12 && (
                          <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 4 }}>
                            … {response.rows.length - 12} more rows
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- Proposals --- */}
      {proposals.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-header">
            <span>Pending Proposals</span>
            <span className="context-count-badge">{proposals.length}</span>
          </div>
          <div className="panel-section-body">
            <div className="proposals-list">
              {proposals.map((p) => (
                <div key={p.id} className="proposal-card">
                  <div className="proposal-header">
                    <span className="proposal-agent">{p.agentRole}</span>
                    {p.risk && (
                      <span className={`proposal-risk ${p.risk}`}>{p.risk}</span>
                    )}
                  </div>
                  <div className="proposal-text">{p.description}</div>
                  {p.impact && <div className="proposal-impact">{p.impact}</div>}
                  <div className="proposal-actions">
                    <button
                      className="proposal-btn approve"
                      onClick={() => handleProposalAction(p.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      className="proposal-btn reject"
                      onClick={() => handleProposalAction(p.id, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
