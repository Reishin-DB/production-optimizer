import React, { useEffect, useRef, useState } from "react";

interface SpecialistInfo { id: string; name: string; feature: string; endpoint?: string; desc?: string }
interface SpecialistResult {
  id: string; name: string; feature: string; endpoint?: string;
  ms?: number; result?: string; query?: string; error?: string;
  skipped?: boolean; reason?: string;
}
interface SupervisorInfo { name: string; model: string; specialists: SpecialistInfo[]; verdicts?: string[] }
interface Recommendation { rec_id: string; title?: string; priority?: string; affected_entities?: string }
interface Well { well_id: string; well_name?: string }

const PRESET_QUESTIONS = [
  "Approve this optimization recommendation?",
  "What is the economic case — is the NPV worth it?",
  "Is this operationally feasible on this well right now?",
  "Any analog precedent, and what did we try before?",
];

type Status = "idle" | "running" | "done" | "error" | "skipped";

interface RouteDecision { id: string; name: string; engage: boolean; reason: string }
interface Plan { strategy: string; route: RouteDecision[]; model?: string; plan_ms?: number }
interface CostInfo { model: string; calls: number; prompt_tokens: number; completion_tokens: number; in_per_m: number; out_per_m: number; usd: number }
interface GovInfo { gateway: string; guardrails: string[]; audit: string; data: string; model_governed: string }

export default function SupervisorTab() {
  const [info, setInfo]         = useState<SupervisorInfo | null>(null);
  const [recs, setRecs]         = useState<Recommendation[]>([]);
  const [wells, setWells]       = useState<Well[]>([]);
  const [question, setQ]        = useState(PRESET_QUESTIONS[0]);
  const [recId, setRecId]       = useState<string>("");
  const [wellId, setWellId]     = useState<string>("");
  const [oilPrice, setOilPrice] = useState<number>(75);
  const [running, setRunning]   = useState(false);
  const [status, setStatus]     = useState<Record<string, Status>>({});
  const [results, setResults]   = useState<Record<string, SpecialistResult>>({});
  const [rec, setRec]           = useState<{ text: string; total_ms: number; verdict?: string; model?: string; cost?: CostInfo; governance?: GovInfo } | null>(null);
  const [plan, setPlan]         = useState<Plan | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [models, setModels]     = useState<{ id: string; label: string; note: string; family: string; inPerM?: number; outPerM?: number; tier?: string }[]>([]);
  const [model, setModel]       = useState<string>("databricks-claude-sonnet-4-5");

  useEffect(() => {
    fetch("/api/model").then(r => r.json()).then(d => {
      if (d.model) setModel(d.model);
      if (Array.isArray(d.available)) setModels(d.available);
    }).catch(() => {});
  }, []);

  function pickModel(m: string) {
    const prev = model;
    setModel(m);
    fetch("/api/model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m }) })
      .then(r => r.json()).then(d => { if (!d.ok) setModel(prev); })
      .catch(() => setModel(prev));
  }
  const abortRef                = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/supervisor/info").then(r => r.json()).then(setInfo).catch(() => {});
    fetch("/api/production/recommendations")
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : (data?.recommendations ?? []);
        if (arr.length) { setRecs(arr); setRecId(arr[0].rec_id || ""); }
      })
      .catch(() => {});
    fetch("/api/twin/state")
      .then(r => r.ok ? r.json() : null)
      .then((s: any) => {
        const ws = s?.wells || [];
        if (Array.isArray(ws) && ws.length) {
          setWells(ws.map((w: any) => ({ well_id: w.well_id || w.id, well_name: w.well_name || w.name })));
          if (ws[0]) setWellId(ws[0].well_id || ws[0].id || "");
        }
      })
      .catch(() => {});
  }, []);

  async function ask() {
    if (!question.trim() || running) return;
    setRunning(true); setRec(null); setErr(null); setResults({}); setPlan(null); setStatus({});
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const resp = await fetch("/api/supervisor/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question, rec_id: recId || null, well_id: wellId || null, oil_price: oilPrice,
        }),
        signal: ac.signal,
      });
      if (!resp.body) throw new Error("no body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, nl); buf = buf.slice(nl + 2);
          let ev = "message", dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) ev = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let data: any;
          try { data = JSON.parse(dataStr); } catch { continue; }
          if (ev === "start") {
            const init: Record<string, Status> = {};
            for (const s of data.specialists || []) init[s.id] = "idle";
            setStatus(init);
          } else if (ev === "plan") {
            setPlan(data as Plan);
            // Reflect the routing decision immediately: engaged -> running, skipped -> skipped.
            setStatus(prev => {
              const next = { ...prev };
              for (const r of (data.route || []) as RouteDecision[]) {
                next[r.id] = r.engage ? "running" : "skipped";
              }
              return next;
            });
          } else if (ev === "specialist") {
            setResults(prev => ({ ...prev, [data.id]: data }));
            setStatus(prev => ({ ...prev, [data.id]: data.skipped ? "skipped" : data.error ? "error" : "done" }));
          } else if (ev === "recommendation") {
            setRec({ text: data.text || "", total_ms: data.total_ms || 0, verdict: data.verdict, model: data.model, cost: data.cost, governance: data.governance });
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") setErr(String(e.message || e));
    } finally {
      setRunning(false); abortRef.current = null;
    }
  }

  function cancel() { abortRef.current?.abort(); setRunning(false); }

  const verdictColor = (v?: string) => {
    if (!v) return "#94a3b8";
    if (v === "APPROVE")           return "#22c55e";
    if (v === "APPROVE-WITH-MODS") return "#eab308";
    if (v === "DEFER")             return "#94a3b8";
    if (v === "REJECT")            return "#ef4444";
    return "#94a3b8";
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{
        background: "linear-gradient(135deg, #0a0e1a 0%, #150f2e 100%)",
        border: "1px solid #2d1b69", borderRadius: 14, padding: "18px 22px",
        marginBottom: 14, display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, minWidth: 48,
          background: "radial-gradient(circle at 30% 30%, #a78bfa, #7c3aed 70%)",
          border: "1.5px solid #a78bfa55", borderRadius: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, boxShadow: "0 0 20px #7c3aed33",
        }}>🧠</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>
            Recommendation Approval Supervisor
          </div>
          <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 3, fontWeight: 500 }}>
            Plans the task → routes to the right specialists → synthesizes a verdict · Choice · Cost · Governance
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(info?.verdicts || ["APPROVE","MODS","DEFER","REJECT"]).map(v => (
            <span key={v} style={{
              border: "1px solid #334155", borderRadius: 10, padding: "3px 8px",
              fontSize: 10, color: "#94a3b8", fontWeight: 600,
            }}>{v}</span>
          ))}
        </div>
      </div>

      {/* Control · Cost · Choice — live model picker (routes the Supervisor's FM calls) */}
      <div style={{
        background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 12,
        padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "#4dabf7" }}>CHOICE · COST · CONTROL</span>
        <span style={{ fontSize: 10.5, color: "#64748b" }}>pick a model — the Supervisor routes to it, no code change · governed by AI Gateway · price = $/1M tokens:</span>
        {(models.length ? models : [{ id: "databricks-claude-sonnet-4-5", label: "Claude Sonnet 4.5", note: "default", family: "Anthropic", inPerM: 3, outPerM: 15, tier: "$$" }]).map(m => {
          const active = m.id === model;
          const tierColor = m.tier === "$$$" ? "#f97316" : m.tier === "$$" ? "#eab308" : "#22c55e";
          return (
            <button key={m.id} onClick={() => pickModel(m.id)} title={`${m.id}\n$${m.inPerM}/1M in · $${m.outPerM}/1M out`} style={{
              display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
              background: active ? "#4dabf722" : "#111827",
              border: `1px solid ${active ? "#4dabf7" : "#1e293b"}`, borderRadius: 6, padding: "4px 9px",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: active ? "#4dabf7" : "#475569" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? "#4dabf7" : "#cbd5e1" }}>{m.label}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: m.family === "Open" ? "#22c55e" : "#a78bfa" }}>{m.family}</span>
              {m.tier && <span title={`$${m.inPerM}/1M in · $${m.outPerM}/1M out`} style={{ fontSize: 9, fontWeight: 800, color: tierColor, letterSpacing: "0.5px" }}>{m.tier}</span>}
            </button>
          );
        })}
      </div>

      <div style={{
        background: "#0d1220", border: "1px solid #1E2D4F", borderRadius: 12,
        padding: 16, marginBottom: 14, display: "grid",
        gridTemplateColumns: "1fr 220px 180px 110px auto", gap: 10, alignItems: "end",
      }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>Question</span>
          <input value={question} onChange={e => setQ(e.target.value)} style={inp} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>Recommendation</span>
          <select value={recId} onChange={e => setRecId(e.target.value)} style={inp}>
            <option value="">(none)</option>
            {recs.map(r => (
              <option key={r.rec_id} value={r.rec_id}>{r.rec_id} — {(r.title || "").slice(0, 30)}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>Well</span>
          <select value={wellId} onChange={e => setWellId(e.target.value)} style={inp}>
            <option value="">(none)</option>
            {wells.map(w => (
              <option key={w.well_id} value={w.well_id}>{w.well_id}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>Oil $/bbl</span>
          <input type="number" value={oilPrice} step={1} onChange={e => setOilPrice(+e.target.value)} style={inp} />
        </label>
        {running
          ? <button onClick={cancel} style={{ ...btn, background: "#ef4444", color: "#fff" }}>Cancel</button>
          : <button onClick={ask} disabled={!question.trim()} style={btn}>Run Supervisor</button>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {PRESET_QUESTIONS.map(q => (
          <button key={q} onClick={() => setQ(q)} style={chip}>{q}</button>
        ))}
      </div>

      {err && (
        <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444",
                      borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 14 }}>{err}</div>
      )}

      {plan && (
        <div style={{
          background: "linear-gradient(135deg, #0a0e1a 0%, #10131f 100%)",
          border: "1px solid #2d1b69", borderRadius: 12, padding: "14px 16px", marginBottom: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: "#a78bfa" }}>ORCHESTRATION PLAN</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>supervisor decided which agents this question needs</span>
            {plan.plan_ms != null && <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>{plan.plan_ms} ms</span>}
          </div>
          <div style={{ fontSize: 12.5, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 10 }}>{plan.strategy}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5, background: "#7c3aed22",
              border: "1px solid #a78bfa66", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#c4b5fd",
            }}>🧠 Supervisor</span>
            <span style={{ color: "#475569", fontSize: 14 }}>→</span>
            {plan.route.map(r => (
              <span key={r.id} title={r.reason} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: r.engage ? "#22c55e18" : "#0f172a",
                border: `1px solid ${r.engage ? "#22c55e55" : "#1e293b"}`,
                borderRadius: 8, padding: "4px 10px", fontSize: 11,
                color: r.engage ? "#86efac" : "#475569",
                textDecoration: r.engage ? "none" : "line-through", opacity: r.engage ? 1 : 0.75,
              }}>
                {r.engage ? "✓" : "○"} {r.name}
                {r.reason && <span style={{ fontSize: 9.5, color: r.engage ? "#4ade8099" : "#475569", fontWeight: 400 }}>· {r.reason}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {rec && (
        <div style={{
          background: "#0d1220", border: "1px solid #1E2D4F", borderRadius: 12,
          padding: 16, marginBottom: 14, borderLeft: `4px solid ${verdictColor(rec.verdict)}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: verdictColor(rec.verdict), letterSpacing: "0.02em" }}>
              VERDICT — {rec.verdict || "REVIEW"}
            </div>
            <div style={{ fontSize: 10, color: "#64748b", display: "flex", gap: 10, alignItems: "center" }}>
              {rec.model && <span style={{ color: "#4dabf7", fontFamily: "monospace" }}>model: {rec.model}</span>}
              <span>{rec.total_ms} ms total</span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#e2e8f0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{typeof rec.text === "string" ? rec.text : JSON.stringify(rec.text)}</div>

          {(rec.cost || rec.governance) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              {/* COST */}
              {rec.cost && (
                <div style={{ background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "#eab308", marginBottom: 8 }}>💰 COST · THIS RUN</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: "#facc15" }}>
                      {rec.cost.usd < 0.01 ? `${(rec.cost.usd * 100).toFixed(3)}¢` : `$${rec.cost.usd.toFixed(4)}`}
                    </span>
                    <span style={{ fontSize: 10, color: "#64748b" }}>{rec.cost.calls} model call{rec.cost.calls === 1 ? "" : "s"}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#94a3b8", lineHeight: 1.7, fontFamily: "monospace" }}>
                    <div>in: {rec.cost.prompt_tokens.toLocaleString()} tok × ${rec.cost.in_per_m}/1M</div>
                    <div>out: {rec.cost.completion_tokens.toLocaleString()} tok × ${rec.cost.out_per_m}/1M</div>
                  </div>
                  <div style={{ fontSize: 9.5, color: "#475569", marginTop: 6 }}>Switch to a cheaper model above — same orchestration, lower cost per run.</div>
                </div>
              )}
              {/* GOVERNANCE */}
              {rec.governance && (
                <div style={{ background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "#22d3ee", marginBottom: 8 }}>🛡️ GOVERNANCE</div>
                  <div style={{ fontSize: 11.5, color: "#e2e8f0", fontWeight: 600, marginBottom: 6 }}>{rec.governance.gateway}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {rec.governance.guardrails.map(g => (
                      <span key={g} style={{ fontSize: 9.5, color: "#67e8f9", background: "#06b6d418", border: "1px solid #06b6d444", borderRadius: 6, padding: "2px 7px" }}>{g}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#94a3b8", lineHeight: 1.7 }}>
                    <div>📋 {rec.governance.audit}</div>
                    <div>🔒 {rec.governance.data}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {(info?.specialists || []).map(s => {
          const r = results[s.id];
          const st = status[s.id] || "idle";
          const border = st === "done" ? "#22c55e" : st === "error" ? "#ef4444" : st === "running" ? "#eab308" : st === "skipped" ? "#334155" : "#1E2D4F";
          const skipped = st === "skipped";
          return (
            <div key={s.id} style={{
              background: "#0d1220", border: "1px solid #1E2D4F", borderRadius: 10,
              padding: 12, borderLeft: `3px solid ${border}`, opacity: skipped ? 0.55 : 1,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: skipped ? "#64748b" : "#e2e8f0" }}>{s.name}</span>
                {skipped
                  ? <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", border: "1px solid #334155", borderRadius: 6, padding: "1px 6px" }}>NOT ENGAGED</span>
                  : r?.ms != null && <span style={{ fontSize: 10, color: "#64748b" }}>{r.ms} ms</span>}
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>
                {s.feature}{(r?.endpoint || s.endpoint) ? ` · ${r?.endpoint || s.endpoint}` : ""}
              </div>
              {st === "running" && <div style={{ fontSize: 11, color: "#eab308" }}>running…</div>}
              {st === "idle"    && <div style={{ fontSize: 11, color: "#475569" }}>{s.desc || "(waiting)"}</div>}
              {skipped && <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic" }}>{r?.reason ? `Skipped — ${r.reason}` : "Skipped by the orchestration plan."}</div>}
              {r?.error && <div style={{ fontSize: 11, color: "#fca5a5" }}>{r.error}</div>}
              {!skipped && r?.result && (
                <pre style={{ fontSize: 11, color: "#cbd5e1", whiteSpace: "pre-wrap",
                              fontFamily: "inherit", margin: 0, lineHeight: 1.5 }}>{typeof r.result === "string" ? r.result : JSON.stringify(r.result)}</pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: "8px 10px", background: "#0d1220", border: "1px solid #1E2D4F",
  borderRadius: 6, color: "#e2e8f0", fontSize: 12,
};
const btn: React.CSSProperties = {
  padding: "10px 18px", fontSize: 13, fontWeight: 600,
  background: "linear-gradient(135deg, #a78bfa, #7c3aed)",
  color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
};
const chip: React.CSSProperties = {
  fontSize: 11, padding: "5px 10px", border: "1px solid #1E2D4F",
  borderRadius: 14, background: "transparent", color: "#94a3b8", cursor: "pointer",
};
