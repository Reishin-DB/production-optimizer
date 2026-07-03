import { Router } from 'express';

/*
 * Control · Cost · Choice — runtime model selection.
 * Holds the currently-selected serving endpoint. The Approval Supervisor reads
 * currentModel() per request, so picking a model in the UI actually re-routes
 * the LLM calls — no redeploy, governed by the same OAuth token + AI Gateway.
 */

const DEFAULT_MODEL = process.env.AGENT_MODEL || 'databricks-claude-sonnet-4-5';

export const AVAILABLE_MODELS = [
  { id: 'databricks-claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'balanced · default', family: 'Anthropic' },
  { id: 'databricks-claude-opus-4-8',   label: 'Claude Opus 4.8',   note: 'deepest reasoning',  family: 'Anthropic' },
  { id: 'databricks-claude-haiku-4-5',  label: 'Claude Haiku 4.5',  note: 'fastest · cheapest', family: 'Anthropic' },
  { id: 'databricks-gpt-oss-120b',      label: 'GPT-OSS 120B',      note: 'open weights',        family: 'Open' },
  { id: 'databricks-llama-4-maverick',  label: 'Llama 4 Maverick',  note: 'open weights',        family: 'Open' },
  { id: 'databricks-qwen35-122b-a10b',  label: 'Qwen 3.5 122B',     note: 'open weights',        family: 'Open' },
];

let _current = DEFAULT_MODEL;
export function currentModel(): string { return _current; }

const router = Router();

router.get('/', (_req, res) => {
  res.json({ model: _current, default: DEFAULT_MODEL, available: AVAILABLE_MODELS });
});

router.post('/', (req, res) => {
  const m = (req.body?.model || '').toString();
  if (AVAILABLE_MODELS.some((x) => x.id === m)) {
    _current = m;
    return res.json({ model: _current, ok: true });
  }
  res.status(400).json({ model: _current, ok: false, error: 'unknown model' });
});

export default router;
