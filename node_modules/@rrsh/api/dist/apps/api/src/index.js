"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const domain_1 = require("@rrsh/domain");
const payroll_engine_1 = require("@rrsh/payroll-engine");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const app = (0, fastify_1.default)({ logger: true });
void app.register(cors_1.default, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
});
class FileBackedConceptRepository {
    inner;
    filePath;
    constructor(inner, filePath) {
        this.inner = inner;
        this.filePath = filePath;
    }
    async init() {
        try {
            const raw = await (0, promises_1.readFile)(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            for (const concept of parsed) {
                await this.inner.save(concept);
            }
        }
        catch {
            await this.persist();
        }
    }
    async list() {
        return this.inner.list();
    }
    async save(concept) {
        await this.inner.save(concept);
        await this.persist();
    }
    async delete(id) {
        const innerAny = this.inner;
        if (typeof innerAny.delete === "function") {
            await innerAny.delete(id);
        }
        else if (innerAny.concepts instanceof Map) {
            innerAny.concepts.delete(id);
        }
        else {
            throw new Error("Delete operation unavailable in in-memory repository");
        }
        await this.persist();
    }
    async replaceAll(concepts) {
        const innerAny = this.inner;
        if (typeof innerAny.replaceAll === "function") {
            await innerAny.replaceAll(concepts);
        }
        else if (innerAny.concepts instanceof Map) {
            innerAny.concepts.clear();
            for (const concept of concepts) {
                innerAny.concepts.set(concept.id, concept);
            }
        }
        else {
            throw new Error("ReplaceAll operation unavailable in in-memory repository");
        }
        await this.persist();
    }
    async persist() {
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(this.filePath), { recursive: true });
        const concepts = await this.inner.list();
        await (0, promises_1.writeFile)(this.filePath, JSON.stringify(concepts, null, 2), "utf8");
    }
}
const diskDbPath = process.env.CONCEPT_DB_FILE ??
    (0, node_path_1.resolve)(process.cwd(), ".test-db", "concepts.json");
const repo = process.env.NODE_ENV === "production"
    ? new domain_1.InMemoryConceptRepository()
    : new FileBackedConceptRepository(new domain_1.InMemoryConceptRepository(), diskDbPath);
app.get("/health", async () => ({ ok: true }));
app.get("/concepts", async () => repo.list());
app.post("/concepts", async (req) => {
    await repo.save(req.body);
    return { ok: true };
});
app.put("/concepts", async (req) => {
    await repo.replaceAll(req.body ?? []);
    return { ok: true };
});
app.delete("/concepts/:id", async (req) => {
    await repo.delete(Number(req.params.id));
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
    if (repo instanceof FileBackedConceptRepository) {
        await repo.init();
        app.log.info(`Concept DB file: ${diskDbPath}`);
    }
    await app.listen({ port: 3001, host: "0.0.0.0" });
};
start().catch((err) => {
    app.log.error(err);
    process.exit(1);
});
