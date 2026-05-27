"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rbac_1 = require("../middleware/rbac");
const provider_1 = require("../twin/provider");
const genie_1 = require("./genie");
const router = (0, express_1.Router)();
const provider = new provider_1.InMemoryTwinDataProvider();
const HIDDEN_PROP_KEYS = new Set(['color', 'geometry', 'layerType', '_vectorTileFeature']);
function describeFeature(f) {
    const name = f.name || f.id || f.well_id || 'asset';
    const pairs = Object.entries(f)
        .filter(([k, v]) => !HIDDEN_PROP_KEYS.has(k) && v !== null && v !== undefined && v !== '' && k !== 'name')
        .slice(0, 8)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
    return pairs ? `${name} (${pairs})` : name;
}
// POST /api/agent/query — delegates to Genie
router.post('/query', (0, rbac_1.requireRole)(rbac_1.ROLES.PROD_ENGINEER, rbac_1.ROLES.RESERVOIR_ENGINEER, rbac_1.ROLES.COMMERCIAL_ANALYST, rbac_1.ROLES.AI_AGENT_PROD, rbac_1.ROLES.AI_AGENT_COMM), async (req, res) => {
    const { prompt, selectedEntities, conversation_id } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }
    const features = Array.isArray(selectedEntities) ? selectedEntities : [];
    const contextLine = features.length
        ? `Context — selected ${features.length === 1 ? 'asset' : 'assets'}: ${features.map(describeFeature).join('; ')}.`
        : '';
    const question = contextLine ? `${contextLine}\n\n${prompt.trim()}` : prompt.trim();
    try {
        const result = await genie_1.genieClient.askSync(question, conversation_id);
        const counts = { selected: features.length };
        if (Array.isArray(result.rows))
            counts.rows = result.rows.length;
        res.json({
            summary: result.text || result.error || 'No response from Genie.',
            agentRole: 'genie',
            contextCounts: counts,
            conversation_id: result.conversation_id,
            sql: result.sql,
            columns: result.columns,
            rows: result.rows,
        });
    }
    catch (e) {
        console.error('[agent.query] genie error:', e?.message || e);
        res.status(502).json({
            summary: `Genie error: ${e?.message || e}`,
            agentRole: 'genie',
        });
    }
});
// POST /api/agent/proposal/:id/approve
router.post('/proposal/:id/approve', (0, rbac_1.requireRole)(rbac_1.ROLES.PROD_ENGINEER, rbac_1.ROLES.SHIFT_SUPERVISOR), async (req, res) => {
    const { id } = req.params;
    const state = await provider.loadState();
    for (const agent of state.agents) {
        const proposal = agent.pendingProposals.find((p) => p.id === id);
        if (proposal) {
            proposal.status = 'approved';
            proposal.approvedBy = req.user?.name ?? 'unknown';
            return res.json({ success: true, proposal });
        }
    }
    return res.status(404).json({ error: `Proposal ${id} not found` });
});
// POST /api/agent/proposal/:id/reject
router.post('/proposal/:id/reject', (0, rbac_1.requireRole)(rbac_1.ROLES.PROD_ENGINEER, rbac_1.ROLES.SHIFT_SUPERVISOR), async (req, res) => {
    const { id } = req.params;
    const state = await provider.loadState();
    for (const agent of state.agents) {
        const proposal = agent.pendingProposals.find((p) => p.id === id);
        if (proposal) {
            proposal.status = 'rejected';
            return res.json({ success: true, proposal });
        }
    }
    return res.status(404).json({ error: `Proposal ${id} not found` });
});
// GET /api/agent/proposals
router.get('/proposals', (0, rbac_1.requireRole)(rbac_1.ROLES.PROD_ENGINEER, rbac_1.ROLES.SHIFT_SUPERVISOR, rbac_1.ROLES.AI_AGENT_PROD), async (_req, res) => {
    const state = await provider.loadState();
    const allProposals = state.agents.flatMap((a) => a.pendingProposals.map((p) => ({ ...p, agentRole: a.role })));
    res.json(allProposals);
});
exports.default = router;
