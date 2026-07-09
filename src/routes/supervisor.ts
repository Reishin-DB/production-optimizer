/**
 * Recommendation Approval Supervisor — Node-native, 5 parallel specialists.
 *
 * Endpoints:
 *   POST /api/supervisor/decide  — SSE stream (start → specialist × 5 → recommendation → done)
 *   GET  /api/supervisor/info    — Static info about specialists for the UI
 */
import { Router, Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';
import { currentModel } from './model';

const router = Router();

const RAW_HOST = (process.env.DATABRICKS_HOST || '').replace(/\/$/, '');
const HOST = RAW_HOST && !RAW_HOST.startsWith('http') ? `https://${RAW_HOST}` : RAW_HOST;
const CLIENT_ID = process.env.DATABRICKS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DATABRICKS_CLIENT_SECRET || '';
const WAREHOUSE_ID = process.env.DATABRICKS_WAREHOUSE_ID || '';
const CATALOG = process.env.DEMO_CATALOG || 'oil_pump_monitor_catalog';
const SCHEMA = process.env.DEMO_SCHEMA || 'production_optimizer';

// ── Shared OAuth + HTTP helpers (reuse from genie.ts pattern, but inlined to avoid cycles) ──
let _token = '';
let _tokenExpires = 0;

function fetchJson(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
        }
        try { resolve(text ? JSON.parse(text) : {}); } catch { resolve({ _raw: text }); }
      });
    });
    req.on('error', reject);
    // Hard timeout so a slow/cold-starting model endpoint can't hang the SSE run forever.
    req.setTimeout(75_000, () => { req.destroy(new Error('model request timed out (endpoint slow or cold-starting)')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpires - 60_000) return _token;
  if (!HOST || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Apps OAuth env not set');
  }
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const r = await fetchJson(`${HOST}/oidc/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials&scope=all-apis',
  });
  if (!r.access_token) throw new Error(`token failed: ${JSON.stringify(r).slice(0, 200)}`);
  _token = r.access_token;
  _tokenExpires = Date.now() + Number(r.expires_in || 3600) * 1000;
  return _token;
}

async function dbxApi(path: string, opts: { method?: string; body?: string } = {}): Promise<any> {
  const token = await getToken();
  return fetchJson(`${HOST}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

// ── Foundation Model API + per-run token accounting (Cost pillar) ─────
// Accumulates real token usage across every FM call in one /decide run so the UI
// can show an actual (not guessed) cost for the selected model.
let _usage = { prompt: 0, completion: 0, calls: 0 };
function resetUsage() { _usage = { prompt: 0, completion: 0, calls: 0 }; }

async function claudeCall(system: string, user: string, maxTokens = 600): Promise<string> {
  try {
    const r = await dbxApi(`/serving-endpoints/${currentModel()}/invocations`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });
    const u = r?.usage || {};
    _usage.prompt += Number(u.prompt_tokens || 0);
    _usage.completion += Number(u.completion_tokens || 0);
    _usage.calls += 1;
    // Coerce content to a string. Open models (GPT-OSS, etc.) can return content as
    // an array of parts or an object; returning that non-string crashes the React UI.
    const c = r?.choices?.[0]?.message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('').trim();
    return c != null ? String(c) : '';
  } catch (e: any) {
    return `(Claude unavailable: ${e?.message || e})`;
  }
}

// USD per 1M tokens per model, mirrors AVAILABLE_MODELS in model.ts (Cost pillar).
const MODEL_RATES: Record<string, { inPerM: number; outPerM: number }> = {
  'databricks-claude-sonnet-4-5': { inPerM: 3.00,  outPerM: 15.00 },
  'databricks-claude-opus-4-8':   { inPerM: 15.00, outPerM: 75.00 },
  'databricks-claude-haiku-4-5':  { inPerM: 0.80,  outPerM: 4.00 },
  'databricks-gpt-oss-120b':      { inPerM: 0.50,  outPerM: 1.50 },
  'databricks-llama-4-maverick':  { inPerM: 0.60,  outPerM: 1.80 },
  'databricks-qwen35-122b-a10b':  { inPerM: 0.70,  outPerM: 2.00 },
};

function costForRun(model: string) {
  const rate = MODEL_RATES[model] || MODEL_RATES['databricks-claude-sonnet-4-5'];
  const usd = (_usage.prompt / 1e6) * rate.inPerM + (_usage.completion / 1e6) * rate.outPerM;
  return {
    model, calls: _usage.calls,
    prompt_tokens: _usage.prompt, completion_tokens: _usage.completion,
    in_per_m: rate.inPerM, out_per_m: rate.outPerM,
    usd: Number(usd.toFixed(5)),
  };
}

// ── SQL via Statement Execution ──────────────────────────────
async function runSql(sql: string): Promise<{ cols: string[]; rows: any[][] }> {
  if (!WAREHOUSE_ID) throw new Error('DATABRICKS_WAREHOUSE_ID not set');
  // Submit
  const submit = await dbxApi(`/api/2.0/sql/statements`, {
    method: 'POST',
    body: JSON.stringify({
      warehouse_id: WAREHOUSE_ID,
      statement: sql,
      wait_timeout: '30s',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
    }),
  });
  let s = submit;
  let polls = 0;
  while (s?.status?.state && ['PENDING', 'RUNNING'].includes(s.status.state) && polls < 12) {
    await new Promise(r => setTimeout(r, 500));
    s = await dbxApi(`/api/2.0/sql/statements/${s.statement_id}`);
    polls++;
  }
  if (s?.status?.state === 'FAILED') {
    throw new Error(`SQL failed: ${s.status?.error?.message || ''}`);
  }
  const cols = (s?.manifest?.schema?.columns || []).map((c: any) => c.name);
  const rows = s?.result?.data_array || [];
  return { cols, rows };
}

function fmtRows(cols: string[], rows: any[][], limit = 20): string {
  if (!rows.length) return '(no rows)';
  const out = [cols.join(' | ')];
  for (const r of rows.slice(0, limit)) {
    out.push(r.map((v: any) => (v == null ? '' : String(v))).join(' | '));
  }
  if (rows.length > limit) out.push(`… ${rows.length - limit} more rows`);
  return out.join('\n');
}

// ── Context loader ──────────────────────────────────────────
interface DecideReq {
  question: string;
  rec_id?: string | null;
  well_id?: string | null;
  oil_price?: number;
}

async function loadContext(req: DecideReq): Promise<any> {
  const ctx: any = { rec: null, well: null };
  if (req.rec_id) {
    try {
      const { cols, rows } = await runSql(
        `SELECT * FROM ${CATALOG}.${SCHEMA}.gold_recommendations WHERE rec_id = '${req.rec_id}' LIMIT 1`
      );
      if (rows.length) ctx.rec = Object.fromEntries(cols.map((c, i) => [c, rows[0][i]]));
    } catch {}
  }
  if (req.well_id) {
    try {
      const { cols, rows } = await runSql(
        `SELECT well_id, well_name, well_type, status, pattern_id, oil_rate, gas_rate, water_rate, co2_inj_rate ` +
        `FROM ${CATALOG}.${SCHEMA}.bronze_wells WHERE well_id = '${req.well_id}' LIMIT 1`
      );
      if (rows.length) ctx.well = Object.fromEntries(cols.map((c, i) => [c, rows[0][i]]));
    } catch {}
  }
  return ctx;
}

// ── Specialists ─────────────────────────────────────────────
async function specialistDecline(req: DecideReq, ctx: any) {
  const t0 = Date.now();
  const wellId = req.well_id || (ctx.rec?.affected_entities || '').split(',')[0]?.trim();
  if (!wellId) {
    return { id: 'decline', name: 'Decline Curve Analyst', feature: 'Foundation Model API · Claude',
             endpoint: currentModel(), ms: Date.now() - t0, result: '(no well selected)' };
  }
  try {
    const { cols, rows } = await runSql(
      `SELECT well_id, well_name, qi, di, b_factor, decline_type, r_squared, eur, remaining_reserves, current_rate ` +
      `FROM ${CATALOG}.${SCHEMA}.gold_decline_curves WHERE well_id = '${wellId}' LIMIT 1`
    );
    if (!rows.length) {
      return { id: 'decline', name: 'Decline Curve Analyst', feature: 'Foundation Model API · Claude',
               endpoint: currentModel(), ms: Date.now() - t0, result: `(no decline curve for ${wellId})` };
    }
    const facts = fmtRows(cols, rows);
    const system = "You are a reservoir engineer. Given an Arps decline-curve fit for one well, give a 3-line " +
      "assessment: (1) overall confidence, (2) one upside, (3) the biggest risk. Cite the numbers. No preamble.";
    const analysis = await claudeCall(system, facts, 350);
    return { id: 'decline', name: 'Decline Curve Analyst', feature: 'Foundation Model API · Claude',
             endpoint: currentModel(), ms: Date.now() - t0, result: analysis, evidence: facts };
  } catch (e: any) {
    return { id: 'decline', name: 'Decline Curve Analyst', feature: 'Foundation Model API · Claude',
             endpoint: currentModel(), ms: Date.now() - t0, result: `(error: ${e?.message || e})` };
  }
}

async function specialistEconomics(req: DecideReq, ctx: any) {
  const t0 = Date.now();
  const rec = ctx.rec || {};
  const parts: string[] = [];
  if (rec.rec_id) {
    parts.push(
      `Recommendation impact: +${rec.oil_rate_change || 0} bopd · $${((rec.daily_revenue || 0) / 1000).toFixed(1)}K/day · ` +
      `$${((rec.annual_revenue || 0) / 1e6).toFixed(1)}M/yr · priority=${rec.priority || '?'} · risk=${rec.risk || '?'}`
    );
    if (rec.physics_rationale) parts.push(`Rationale: ${String(rec.physics_rationale).slice(0, 200)}`);
  } else {
    parts.push('(no rec_id provided)');
  }
  try {
    const { cols, rows } = await runSql(
      `SELECT total_revenue, total_opex, field_netback, incremental_netback, breakeven, carbon_credit_revenue, well_count ` +
      `FROM ${CATALOG}.${SCHEMA}.gold_field_economics LIMIT 1`
    );
    parts.push('\nField context:');
    parts.push(fmtRows(cols, rows));
  } catch (e: any) {
    parts.push(`(field economics query failed: ${e?.message || e})`);
  }
  return { id: 'economics', name: 'Economic Impact Evaluator', feature: 'UC SQL',
           endpoint: `${CATALOG}.${SCHEMA}.gold_field_economics`, ms: Date.now() - t0, result: parts.join('\n') };
}

async function specialistRecHistory(req: DecideReq, ctx: any) {
  const t0 = Date.now();
  const wellId = req.well_id || '';
  const where = wellId ? `affected_entities LIKE '%${wellId}%'` : '1=1';
  try {
    const { cols, rows } = await runSql(
      `SELECT rec_id, priority, title, oil_rate_change, annual_revenue, risk ` +
      `FROM ${CATALOG}.${SCHEMA}.gold_recommendations WHERE ${where} ORDER BY annual_revenue DESC LIMIT 8`
    );
    return { id: 'rec_history', name: 'Recommendation History', feature: 'UC SQL',
             endpoint: `${CATALOG}.${SCHEMA}.gold_recommendations`, ms: Date.now() - t0, result: fmtRows(cols, rows) };
  } catch (e: any) {
    return { id: 'rec_history', name: 'Recommendation History', feature: 'UC SQL',
             endpoint: `${CATALOG}.${SCHEMA}.gold_recommendations`, ms: Date.now() - t0, result: `(error: ${e?.message || e})` };
  }
}

async function specialistAnalog(req: DecideReq, ctx: any) {
  const t0 = Date.now();
  const lines = [
    'Curated analog references (Vector Search index not wired):',
    '  · SPE-187521 — Decline curve fit for tight oil patterns (b=0.8-1.2 typical)',
    '  · SPE-202345 — Choke optimization on CO2-flood pilots (+12% incremental typical)',
    '  · SPE-211009 — Pattern rebalancing in waterflood (NPV uplift case studies)',
  ];
  return { id: 'analog', name: 'Analog Field Reference', feature: 'Vector Search (stub)',
           endpoint: `${CATALOG}.${SCHEMA}.petroleum_documents_vs_index`, ms: Date.now() - t0, result: lines.join('\n') };
}

async function specialistOps(req: DecideReq, ctx: any) {
  const t0 = Date.now();
  const well = ctx.well;
  if (!well) {
    return { id: 'ops', name: 'Operations Feasibility', feature: 'UC SQL',
             endpoint: `${CATALOG}.${SCHEMA}.bronze_wells`, ms: Date.now() - t0, result: '(no well_id provided)' };
  }
  const lines = [
    `Well ${well.well_id} (${well.well_name || ''}) · type=${well.well_type || ''} · ` +
    `status=${well.status || ''} · pattern=${well.pattern_id || ''}`,
    `Current rates: oil=${well.oil_rate || 0} bopd · gas=${well.gas_rate || 0} Mcfd · ` +
    `water=${well.water_rate || 0} bwpd · CO2 inj=${well.co2_inj_rate || 0}`,
  ];
  if (well.pattern_id) {
    try {
      const { cols, rows } = await runSql(
        `SELECT well_id, well_type, status, oil_rate FROM ${CATALOG}.${SCHEMA}.bronze_wells ` +
        `WHERE pattern_id = '${well.pattern_id}' AND well_id != '${well.well_id}' LIMIT 6`
      );
      if (rows.length) {
        lines.push(`\nPattern ${well.pattern_id} neighbors:`);
        lines.push(fmtRows(cols, rows));
      }
    } catch {}
  }
  return { id: 'ops', name: 'Operations Feasibility', feature: 'UC SQL',
           endpoint: `${CATALOG}.${SCHEMA}.bronze_wells`, ms: Date.now() - t0, result: lines.join('\n') };
}

// ── Planner / router — the "omnigent" orchestration step ────
// The supervisor reasons about the question + available context and decides which
// specialists to engage (decomposition + routing), rather than blindly firing all 5.
interface RouteDecision { id: string; name: string; engage: boolean; reason: string }

const SPECIALIST_CATALOG = [
  { id: 'decline',     name: 'Decline Curve Analyst',     needsWell: true,  when: 'production decline, EUR, reserves, forecast, or per-well performance' },
  { id: 'economics',   name: 'Economic Impact Evaluator', needsWell: false, when: 'NPV, revenue, cost, netback, breakeven, or the value of approving' },
  { id: 'rec_history', name: 'Recommendation History',    needsWell: false, when: 'prior recommendations, track record, or what was tried before' },
  { id: 'analog',      name: 'Analog Field Reference',    needsWell: false, when: 'external SPE / analog-field precedent or literature support' },
  { id: 'ops',         name: 'Operations Feasibility',    needsWell: true,  when: 'operational feasibility, well status, pattern neighbors, execution risk' },
];
const NAME_BY_ID: Record<string, string> = Object.fromEntries(SPECIALIST_CATALOG.map(s => [s.id, s.name]));

function fallbackRoute(hasWell: boolean, hasRec: boolean): RouteDecision[] {
  return SPECIALIST_CATALOG.map(s => {
    let engage = true, reason = 'default engage';
    if (!hasWell && s.needsWell) { engage = false; reason = 'no well selected'; }
    if (s.id === 'rec_history' && !hasWell && !hasRec) { engage = false; reason = 'no well or rec context'; }
    return { id: s.id, name: s.name, engage, reason };
  });
}

const PLAN_SYSTEM =
  "You are a multi-agent orchestrator for a CO2-EOR production optimizer. Given a user question and the " +
  "available specialist agents, decide which agents to engage to answer it well. Engage ONLY the relevant " +
  "ones (usually 2-4, rarely all 5). Reply with STRICT JSON only, no prose:\n" +
  '{"strategy":"<one-sentence plan>","route":[{"id":"<agent id>","engage":true,"reason":"<max 8 words>"}]}\n' +
  "Include EVERY agent id in route with engage true or false.";

async function planRoute(req: DecideReq, ctx: any): Promise<{ strategy: string; route: RouteDecision[] }> {
  const hasWell = !!(req.well_id || ctx.well);
  const hasRec = !!(ctx.rec?.rec_id);
  const agentLines = SPECIALIST_CATALOG.map(s => `- ${s.id} (${s.name}): engage when ${s.when}.`).join('\n');
  const user =
    `QUESTION: ${req.question}\n` +
    `Context available: well=${req.well_id || 'none'} · recommendation=${ctx.rec?.rec_id || 'none'} · oil=$${(req.oil_price || 75).toFixed(0)}/bbl\n\n` +
    `AGENTS:\n${agentLines}`;
  try {
    const raw = await claudeCall(PLAN_SYSTEM, user, 300);
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    let route: RouteDecision[] = SPECIALIST_CATALOG.map(s => {
      const found = (json.route || []).find((r: any) => r.id === s.id);
      return {
        id: s.id, name: s.name,
        engage: found ? !!found.engage : true,
        reason: String(found?.reason || '').slice(0, 60) || 'relevant to question',
      };
    });
    // Guardrail: well-dependent agents can't run without a well, whatever the planner said.
    route = route.map(r => {
      const spec = SPECIALIST_CATALOG.find(s => s.id === r.id)!;
      if (!hasWell && spec.needsWell) return { ...r, engage: false, reason: 'no well selected' };
      return r;
    });
    // Never end up with fewer than 2 engaged — fall back if the planner over-pruned.
    if (route.filter(r => r.engage).length < 2) route = fallbackRoute(hasWell, hasRec);
    const strategy = String(json.strategy || '').slice(0, 200) || 'Engaging the specialists relevant to this question.';
    return { strategy, route };
  } catch {
    return {
      strategy: 'Planner model unavailable — engaging all applicable specialists.',
      route: fallbackRoute(hasWell, hasRec),
    };
  }
}

// ── Synthesis ───────────────────────────────────────────────
const SYNTH_SYSTEM =
  "You are the Production Optimizer Approval Supervisor. Five specialists returned findings about a proposed " +
  "production-optimization recommendation. Produce a 1-paragraph approval recommendation " +
  "(APPROVE · APPROVE-WITH-MODS · DEFER · REJECT), then a bullet list of the 3 strongest supporting facts " +
  "and 1 line on the top risk. Cite NPV, oil-rate delta, and any failed checks. Terse and confident. No preamble.";

function extractVerdict(text: string): string {
  if (!text) return 'REVIEW';
  const u = text.toUpperCase();
  if (u.includes('APPROVE-WITH-MODS') || u.includes('APPROVE WITH MODS')) return 'APPROVE-WITH-MODS';
  for (const v of ['REJECT', 'DEFER', 'APPROVE']) if (u.includes(v)) return v;
  return 'REVIEW';
}

async function synthesize(req: DecideReq, ctx: any, specs: any[]): Promise<string> {
  const rec = ctx.rec || {};
  const pack = specs
    .filter(s => !s.error)
    .map(s => `### ${s.name} · ${s.feature || ''}\n${s.result || ''}\n`)
    .join('\n');
  const user =
    `QUESTION: ${req.question}\n` +
    `Recommendation: ${rec.rec_id || '?'} · ${rec.title || '?'} · priority=${rec.priority || '?'} · risk=${rec.risk || '?'}\n` +
    `Well: ${req.well_id || '(none)'} · oil price $${(req.oil_price || 75).toFixed(0)}/bbl\n\n` +
    `SPECIALIST FINDINGS:\n${pack}`;
  return claudeCall(SYNTH_SYSTEM, user, 600);
}

// ── SSE endpoint ────────────────────────────────────────────
function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

router.post('/decide', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const t0 = Date.now();
  const body = (req.body || {}) as DecideReq;
  resetUsage();

  try {
    const ctx = await loadContext(body);
    const rec = ctx.rec || {};
    res.write(sseEvent('start', {
      question: body.question,
      rec_id: body.rec_id,
      well_id: body.well_id,
      rec_title: rec.title,
      rec_priority: rec.priority,
      specialists: [
        { id: 'decline',     name: 'Decline Curve Analyst',    feature: 'Foundation Model API' },
        { id: 'economics',   name: 'Economic Impact Evaluator', feature: 'UC SQL' },
        { id: 'rec_history', name: 'Recommendation History',   feature: 'UC SQL' },
        { id: 'analog',      name: 'Analog Field Reference',   feature: 'Vector Search' },
        { id: 'ops',         name: 'Operations Feasibility',   feature: 'UC SQL' },
      ],
    }));

    // 1) Plan — the supervisor decides which specialists this question actually needs.
    const { strategy, route } = await planRoute(body, ctx);
    res.write(sseEvent('plan', { strategy, route, model: currentModel(), plan_ms: Date.now() - t0 }));

    // 2) Emit skipped cards immediately so the UI can dim them.
    for (const r of route.filter(r => !r.engage)) {
      res.write(sseEvent('specialist', {
        id: r.id, name: NAME_BY_ID[r.id] || r.id, skipped: true,
        reason: r.reason, result: `(not engaged — ${r.reason})`,
      }));
    }

    // 3) Run only the engaged specialists, in parallel.
    const FN_BY_ID: Record<string, (r: DecideReq, c: any) => Promise<any>> = {
      decline: specialistDecline, economics: specialistEconomics, rec_history: specialistRecHistory,
      analog: specialistAnalog, ops: specialistOps,
    };
    const engagedIds = route.filter(r => r.engage).map(r => r.id);
    const promises = engagedIds.map(id => FN_BY_ID[id](body, ctx).catch(e => ({
      id, name: NAME_BY_ID[id] || id, error: String(e?.message || e),
    })));
    const collected: any[] = [];
    for (const p of promises) {
      const result = await p;
      collected.push(result);
      res.write(sseEvent('specialist', result));
    }

    const recText = await synthesize(body, ctx, collected);
    const verdict = extractVerdict(recText);

    // Cost pillar — actual token usage × the selected model's rate.
    const cost = costForRun(currentModel());
    // Governance pillar — everything this run was governed by.
    const governance = {
      gateway: 'Mosaic AI Gateway',
      guardrails: ['PII / safety filters', 'Payload logging', 'Rate limiting'],
      audit: `Agent run logged · ${cost.calls} model call(s) · verdict ${verdict}`,
      data: `Governed UC tables under ${CATALOG}.${SCHEMA} (Unity Catalog ACLs)`,
      model_governed: currentModel(),
    };

    res.write(sseEvent('recommendation', {
      text: recText, verdict, total_ms: Date.now() - t0,
      rec_id: body.rec_id, well_id: body.well_id, model: currentModel(),
      cost, governance,
    }));
    res.write(sseEvent('done', { total_ms: Date.now() - t0 }));
  } catch (e: any) {
    res.write(sseEvent('recommendation', { text: `(error: ${e?.message || e})`, verdict: 'REVIEW', total_ms: Date.now() - t0 }));
    res.write(sseEvent('done', { total_ms: Date.now() - t0 }));
  }
  res.end();
});

router.get('/info', (_req, res) => {
  res.json({
    name: 'Production Optimizer Approval Supervisor',
    model: currentModel(),
    specialists: [
      { id: 'decline',     name: 'Decline Curve Analyst',     feature: 'Foundation Model API', endpoint: currentModel(),                                          desc: 'Claude assesses Arps fit quality and the biggest risk.' },
      { id: 'economics',   name: 'Economic Impact Evaluator', feature: 'UC SQL',               endpoint: `${CATALOG}.${SCHEMA}.gold_field_economics`,    desc: 'Per-rec impact + field-level netback / opex / breakeven from governed UC tables.' },
      { id: 'rec_history', name: 'Recommendation History',    feature: 'UC SQL',               endpoint: `${CATALOG}.${SCHEMA}.gold_recommendations`,    desc: 'Past recommendations for the same well, by annual revenue.' },
      { id: 'analog',      name: 'Analog Field Reference',    feature: 'Vector Search',        endpoint: `${CATALOG}.${SCHEMA}.petroleum_documents_vs_index`, desc: 'Curated SPE references (VS index stub).' },
      { id: 'ops',         name: 'Operations Feasibility',    feature: 'UC SQL',               endpoint: `${CATALOG}.${SCHEMA}.bronze_wells`,            desc: 'Live well status + rates + neighbor pattern context.' },
    ],
    verdicts: ['APPROVE', 'APPROVE-WITH-MODS', 'DEFER', 'REJECT'],
  });
});

export default router;
