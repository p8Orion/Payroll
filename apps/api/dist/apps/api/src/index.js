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
const legajosDbPath = process.env.LEGAJOS_DB_FILE ??
    (0, node_path_1.resolve)(process.cwd(), ".test-db", "legajos.json");
const liquidacionesDbPath = process.env.LIQUIDACIONES_DB_FILE ??
    (0, node_path_1.resolve)(process.cwd(), ".test-db", "liquidaciones.json");
const receiptsDbPath = process.env.RECEIPTS_DB_FILE ??
    (0, node_path_1.resolve)(process.cwd(), ".test-db", "receipts.json");
const conveniosDbPath = process.env.CONVENIOS_DB_FILE ??
    (0, node_path_1.resolve)(process.cwd(), ".test-db", "convenios.json");
const composicionesDbPath = process.env.COMPOSICIONES_DB_FILE ??
    (0, node_path_1.resolve)(process.cwd(), ".test-db", "composiciones-salariales.json");
const f1359FieldsDbPath = process.env.F1359_FIELDS_DB_FILE ??
    (0, node_path_1.resolve)(process.cwd(), ".test-db", "f1359-fields.json");
const fixedConvenios = ["Luz y Fuerza", "Apuaye", "Comercio"];
const repo = new FileBackedConceptRepository(new domain_1.InMemoryConceptRepository(), diskDbPath);
let legajosStore = [];
let liquidacionesStore = [];
let receiptsStore = [];
let conveniosStore = [...fixedConvenios];
let composicionesStore = [];
let f1359FieldsStore = [];
async function initLegajosStore() {
    try {
        const raw = await (0, promises_1.readFile)(legajosDbPath, "utf8");
        const parsed = JSON.parse(raw);
        legajosStore = Array.isArray(parsed) ? parsed : [];
    }
    catch {
        legajosStore = [];
        await persistLegajosStore();
    }
}
async function persistLegajosStore() {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(legajosDbPath), { recursive: true });
    await (0, promises_1.writeFile)(legajosDbPath, JSON.stringify(legajosStore, null, 2), "utf8");
}
async function initLiquidacionesStore() {
    try {
        const raw = await (0, promises_1.readFile)(liquidacionesDbPath, "utf8");
        const parsed = JSON.parse(raw);
        liquidacionesStore = Array.isArray(parsed)
            ? parsed.map((item) => ({
                ...item,
                estado: item.estado === "Anulada" ? "Anulada" : "Generada"
            }))
            : [];
        await persistLiquidacionesStore();
    }
    catch {
        liquidacionesStore = [];
        await persistLiquidacionesStore();
    }
}
async function persistLiquidacionesStore() {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(liquidacionesDbPath), { recursive: true });
    await (0, promises_1.writeFile)(liquidacionesDbPath, JSON.stringify(liquidacionesStore, null, 2), "utf8");
}
async function initReceiptsStore() {
    try {
        const raw = await (0, promises_1.readFile)(receiptsDbPath, "utf8");
        const parsed = JSON.parse(raw);
        receiptsStore = Array.isArray(parsed) ? parsed : [];
    }
    catch {
        receiptsStore = [];
        await persistReceiptsStore();
    }
}
async function persistReceiptsStore() {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(receiptsDbPath), { recursive: true });
    await (0, promises_1.writeFile)(receiptsDbPath, JSON.stringify(receiptsStore, null, 2), "utf8");
}
async function initConveniosStore() {
    try {
        const raw = await (0, promises_1.readFile)(conveniosDbPath, "utf8");
        const parsed = JSON.parse(raw);
        conveniosStore = Array.isArray(parsed) && parsed.length ? parsed : [...fixedConvenios];
    }
    catch {
        conveniosStore = [...fixedConvenios];
        await persistConveniosStore();
    }
}
async function persistConveniosStore() {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(conveniosDbPath), { recursive: true });
    await (0, promises_1.writeFile)(conveniosDbPath, JSON.stringify(conveniosStore, null, 2), "utf8");
}
async function initComposicionesStore() {
    try {
        const raw = await (0, promises_1.readFile)(composicionesDbPath, "utf8");
        const parsed = JSON.parse(raw);
        composicionesStore = Array.isArray(parsed) ? parsed : [];
    }
    catch {
        composicionesStore = [];
        await persistComposicionesStore();
    }
}
async function persistComposicionesStore() {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(composicionesDbPath), { recursive: true });
    await (0, promises_1.writeFile)(composicionesDbPath, JSON.stringify(composicionesStore, null, 2), "utf8");
}
async function initF1359FieldsStore() {
    try {
        const raw = await (0, promises_1.readFile)(f1359FieldsDbPath, "utf8");
        const parsed = JSON.parse(raw);
        f1359FieldsStore = Array.isArray(parsed) ? parsed : [];
    }
    catch {
        f1359FieldsStore = [];
        await persistF1359FieldsStore();
    }
}
async function persistF1359FieldsStore() {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(f1359FieldsDbPath), { recursive: true });
    await (0, promises_1.writeFile)(f1359FieldsDbPath, JSON.stringify(f1359FieldsStore, null, 2), "utf8");
}
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
app.get("/legajos", async () => legajosStore);
app.put("/legajos", async (req) => {
    legajosStore = Array.isArray(req.body) ? req.body : [];
    await persistLegajosStore();
    return { ok: true };
});
app.get("/liquidaciones", async () => liquidacionesStore);
app.post("/liquidaciones", async (req) => {
    if (!req.body?.id)
        return { ok: false };
    const normalized = {
        ...req.body,
        estado: req.body.estado === "Anulada" ? "Anulada" : "Generada"
    };
    liquidacionesStore = [normalized, ...liquidacionesStore.filter((item) => item.id !== req.body.id)];
    await persistLiquidacionesStore();
    return { ok: true };
});
app.put("/liquidaciones/:id/estado", async (req) => {
    const nextEstado = req.body?.estado === "Anulada" ? "Anulada" : "Generada";
    liquidacionesStore = liquidacionesStore.map((item) => item.id === req.params.id ? { ...item, estado: nextEstado } : item);
    await persistLiquidacionesStore();
    return { ok: true };
});
app.delete("/liquidaciones/:id", async (req) => {
    liquidacionesStore = liquidacionesStore.map((item) => item.id === req.params.id ? { ...item, estado: "Anulada" } : item);
    await persistLiquidacionesStore();
    return { ok: true };
});
app.get("/receipts", async () => receiptsStore);
app.put("/receipts", async (req) => {
    receiptsStore = Array.isArray(req.body) ? req.body : [];
    await persistReceiptsStore();
    return { ok: true };
});
app.get("/convenios", async () => conveniosStore);
app.get("/composiciones-salariales", async () => composicionesStore);
app.put("/composiciones-salariales", async (req) => {
    composicionesStore = Array.isArray(req.body) ? req.body : [];
    await persistComposicionesStore();
    return { ok: true };
});
app.get("/f1359-fields", async () => f1359FieldsStore);
app.put("/f1359-fields", async (req) => {
    f1359FieldsStore = Array.isArray(req.body) ? req.body : [];
    await persistF1359FieldsStore();
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
    await repo.init();
    app.log.info(`Concept DB file: ${diskDbPath}`);
    await initLegajosStore();
    await initLiquidacionesStore();
    await initReceiptsStore();
    await initConveniosStore();
    await initComposicionesStore();
    await initF1359FieldsStore();
    app.log.info(`Legajos DB file: ${legajosDbPath}`);
    app.log.info(`Liquidaciones DB file: ${liquidacionesDbPath}`);
    app.log.info(`Receipts DB file: ${receiptsDbPath}`);
    app.log.info(`Convenios DB file: ${conveniosDbPath}`);
    app.log.info(`Composiciones DB file: ${composicionesDbPath}`);
    app.log.info(`F1359 Fields DB file: ${f1359FieldsDbPath}`);
    await app.listen({ port: 3001, host: "0.0.0.0" });
};
start().catch((err) => {
    app.log.error(err);
    process.exit(1);
});
