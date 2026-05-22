"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const rbac_1 = require("./middleware/rbac");
const twin_1 = __importDefault(require("./routes/twin"));
const commercial_1 = __importDefault(require("./routes/commercial"));
const map_1 = __importDefault(require("./routes/map"));
const agent_1 = __importDefault(require("./routes/agent"));
const shift_1 = __importDefault(require("./routes/shift"));
const production_1 = __importDefault(require("./routes/production"));
const genie_1 = __importDefault(require("./routes/genie"));
const supervisor_1 = __importDefault(require("./routes/supervisor"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)({
    origin: [
        'https://production-optimizer-7474647106303257.aws.databricksapps.com',
        /^https:\/\/.*\.cloud\.databricks\.com$/,
        'http://localhost:5173',
        'http://localhost:3001',
    ],
    credentials: true,
}));
app.use(express_1.default.json());
app.use(rbac_1.attachDemoUser);
app.use('/api/twin', twin_1.default);
app.use('/api/commercial', commercial_1.default);
app.use('/api/map', map_1.default);
app.use('/api/agent', agent_1.default);
app.use('/api/shift', shift_1.default);
app.use('/api/production', production_1.default);
app.use('/api/genie', genie_1.default);
app.use('/api/supervisor', supervisor_1.default);
// Serve UI in production
const uiDist = path_1.default.join(__dirname, '..', 'ui', 'dist');
app.use(express_1.default.static(uiDist));
app.get('*', (_req, res) => {
    res.sendFile(path_1.default.join(uiDist, 'index.html'));
});
app.listen(PORT, () => {
    console.log(`CO2-EOR Twin API running on port ${PORT}`);
});
