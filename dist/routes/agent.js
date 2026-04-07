"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rbac_1 = require("../middleware/rbac");
const provider_1 = require("../twin/provider");
const economics_1 = require("../commercial/economics");
const router = (0, express_1.Router)();
const provider = new provider_1.InMemoryTwinDataProvider();
// POST /api/agent/query
router.post('/query', (0, rbac_1.requireRole)(rbac_1.ROLES.PROD_ENGINEER, rbac_1.ROLES.RESERVOIR_ENGINEER, rbac_1.ROLES.COMMERCIAL_ANALYST, rbac_1.ROLES.AI_AGENT_PROD, rbac_1.ROLES.AI_AGENT_COMM), async (req, res) => {
    const { prompt, selectedEntities, agentRole } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }
    const state = await provider.loadState();
    // Gather context for selected entities
    const entities = selectedEntities ?? [];
    const relevantWells = state.wells.filter((w) => entities.includes(w.id));
    const relevantFacilities = state.facilities.filter((f) => entities.includes(f.id));
    const relevantPatterns = state.patterns.filter((p) => entities.includes(p.id));
    const relevantAlerts = state.alerts.filter((a) => entities.includes(a.source));
    // Gather economics if commercial role
    let economics = null;
    if (!agentRole || agentRole === 'commercial') {
        const wellEcon = (0, economics_1.getWellEconomics)(state).filter((e) => entities.includes(e.wellId));
        const fieldSummary = (0, economics_1.getFieldEconomicsSummary)(state);
        economics = { wellEcon, fieldSummary };
    }
    res.json({
        summary: 'TODO: Claude API integration — this endpoint will forward the prompt and context to Claude for analysis',
        prompt,
        agentRole: agentRole ?? 'general',
        contextCounts: {
            wells: relevantWells.length,
            facilities: relevantFacilities.length,
            patterns: relevantPatterns.length,
            alerts: relevantAlerts.length,
            hasEconomics: economics !== null,
        },
        context: {
            wells: relevantWells,
            facilities: relevantFacilities,
            patterns: relevantPatterns,
            alerts: relevantAlerts,
            economics,
        },
    });
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
