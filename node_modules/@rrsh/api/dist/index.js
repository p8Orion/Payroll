"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const domain_1 = require("@rrsh/domain");
const payroll_engine_1 = require("@rrsh/payroll-engine");
const app = (0, fastify_1.default)({ logger: true });
const repo = new domain_1.InMemoryConceptRepository();
app.get("/health", async () => ({ ok: true }));
app.get("/concepts", async () => repo.list());
app.post("/concepts", async (req) => {
    await repo.save(req.body);
    return { ok: true };
});
app.post("/liquidaciones/run", async (req) => {
    const concepts = await repo.list();
    const out = (0, payroll_engine_1.runPayroll)({
        concepts,
        params: req.body.params ?? {},
        fixedValuesByCode: req.body.fixedValuesByCode ?? {}
    });
    return out;
});
const start = async () => {
    await app.listen({ port: 3001, host: "0.0.0.0" });
};
start().catch((err) => {
    app.log.error(err);
    process.exit(1);
});
