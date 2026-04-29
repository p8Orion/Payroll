import Fastify from "fastify";
import cors from "@fastify/cors";
import { ConceptRepository, InMemoryConceptRepository } from "@rrsh/domain";
import { runPayroll } from "@rrsh/payroll-engine";
import { ConceptDefinition } from "@rrsh/shared-types";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const app = Fastify({ logger: true });
void app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
});

class FileBackedConceptRepository implements ConceptRepository {
  constructor(
    private readonly inner: InMemoryConceptRepository,
    private readonly filePath: string
  ) {}

  async init(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as ConceptDefinition[];
      for (const concept of parsed) {
        await this.inner.save(concept);
      }
    } catch {
      await this.persist();
    }
  }

  async list(): Promise<ConceptDefinition[]> {
    return this.inner.list();
  }

  async save(concept: ConceptDefinition): Promise<void> {
    await this.inner.save(concept);
    await this.persist();
  }

  async delete(id: number): Promise<void> {
    const innerAny = this.inner as unknown as {
      delete?: (id: number) => Promise<void>;
      concepts?: Map<number, ConceptDefinition>;
      list: () => Promise<ConceptDefinition[]>;
    };
    if (typeof innerAny.delete === "function") {
      await innerAny.delete(id);
    } else if (innerAny.concepts instanceof Map) {
      innerAny.concepts.delete(id);
    } else {
      throw new Error("Delete operation unavailable in in-memory repository");
    }
    await this.persist();
  }

  async replaceAll(concepts: ConceptDefinition[]): Promise<void> {
    const innerAny = this.inner as unknown as {
      replaceAll?: (concepts: ConceptDefinition[]) => Promise<void>;
      concepts?: Map<number, ConceptDefinition>;
    };
    if (typeof innerAny.replaceAll === "function") {
      await innerAny.replaceAll(concepts);
    } else if (innerAny.concepts instanceof Map) {
      innerAny.concepts.clear();
      for (const concept of concepts) {
        innerAny.concepts.set(concept.id, concept);
      }
    } else {
      throw new Error("ReplaceAll operation unavailable in in-memory repository");
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const concepts = await this.inner.list();
    await writeFile(this.filePath, JSON.stringify(concepts, null, 2), "utf8");
  }
}

const diskDbPath =
  process.env.CONCEPT_DB_FILE ??
  resolve(process.cwd(), ".test-db", "concepts.json");
const legajosDbPath =
  process.env.LEGAJOS_DB_FILE ??
  resolve(process.cwd(), ".test-db", "legajos.json");
const liquidacionesDbPath =
  process.env.LIQUIDACIONES_DB_FILE ??
  resolve(process.cwd(), ".test-db", "liquidaciones.json");
const conveniosDbPath =
  process.env.CONVENIOS_DB_FILE ??
  resolve(process.cwd(), ".test-db", "convenios.json");
const composicionesDbPath =
  process.env.COMPOSICIONES_DB_FILE ??
  resolve(process.cwd(), ".test-db", "composiciones-salariales.json");
const fixedConvenios = ["Luz y Fuerza", "Apuaye", "Comercio"] as const;

interface ApiLegajoValorFijo {
  id: string;
  clave: string;
  valor: number;
}

interface ApiLegajo {
  id: string;
  nroLegajo: string;
  nombre: string;
  fechaNacimiento: string;
  fechaIngreso: string;
  fechaEgreso: string;
  convenio: string;
  composicionSalarial: string;
  valoresFijos: ApiLegajoValorFijo[];
}

interface ApiLiquidacionConceptoRow {
  conceptId: number;
  conceptCode: string;
  conceptName: string;
  conceptClass?: "definitivo" | "transitorio";
  conceptTypeId?: "remunerativo" | "no_remunerativo" | "descuentos" | "aportes_patronales";
  conceptColumn?: number;
  conceptSign?: 1 | -1;
  value: unknown;
  formulaUsed: string;
}

interface ApiLiquidacionLegajoRow {
  legajoId: string;
  legajoNro: string;
  legajoNombre: string;
  convenio: string;
  conceptos: ApiLiquidacionConceptoRow[];
  total: number;
}

interface ApiLiquidacionRecord {
  id: string;
  liquidationType: string;
  estado: "Generada" | "Anulada";
  month: number;
  year: number;
  createdAt: string;
  legajos: ApiLiquidacionLegajoRow[];
}

interface ApiComposicionValorFijo {
  id: string;
  clave: string;
  valor: number;
}

interface ApiComposicionSalarial {
  id: string;
  code: string;
  convenio: string;
  valoresFijos: ApiComposicionValorFijo[];
}

const repo: ConceptRepository =
  process.env.NODE_ENV === "production"
    ? new InMemoryConceptRepository()
    : new FileBackedConceptRepository(new InMemoryConceptRepository(), diskDbPath);
let legajosStore: ApiLegajo[] = [];
let liquidacionesStore: ApiLiquidacionRecord[] = [];
let conveniosStore: string[] = [...fixedConvenios];
let composicionesStore: ApiComposicionSalarial[] = [];

async function initLegajosStore(): Promise<void> {
  try {
    const raw = await readFile(legajosDbPath, "utf8");
    const parsed = JSON.parse(raw) as ApiLegajo[];
    legajosStore = Array.isArray(parsed) ? parsed : [];
  } catch {
    legajosStore = [];
    await persistLegajosStore();
  }
}

async function persistLegajosStore(): Promise<void> {
  await mkdir(dirname(legajosDbPath), { recursive: true });
  await writeFile(legajosDbPath, JSON.stringify(legajosStore, null, 2), "utf8");
}

async function initLiquidacionesStore(): Promise<void> {
  try {
    const raw = await readFile(liquidacionesDbPath, "utf8");
    const parsed = JSON.parse(raw) as ApiLiquidacionRecord[];
    liquidacionesStore = Array.isArray(parsed)
      ? parsed.map((item) => ({
          ...item,
          estado: item.estado === "Anulada" ? "Anulada" : "Generada"
        }))
      : [];
    await persistLiquidacionesStore();
  } catch {
    liquidacionesStore = [];
    await persistLiquidacionesStore();
  }
}

async function persistLiquidacionesStore(): Promise<void> {
  await mkdir(dirname(liquidacionesDbPath), { recursive: true });
  await writeFile(liquidacionesDbPath, JSON.stringify(liquidacionesStore, null, 2), "utf8");
}

async function initConveniosStore(): Promise<void> {
  try {
    const raw = await readFile(conveniosDbPath, "utf8");
    const parsed = JSON.parse(raw) as string[];
    conveniosStore = Array.isArray(parsed) && parsed.length ? parsed : [...fixedConvenios];
  } catch {
    conveniosStore = [...fixedConvenios];
    await persistConveniosStore();
  }
}

async function persistConveniosStore(): Promise<void> {
  await mkdir(dirname(conveniosDbPath), { recursive: true });
  await writeFile(conveniosDbPath, JSON.stringify(conveniosStore, null, 2), "utf8");
}

async function initComposicionesStore(): Promise<void> {
  try {
    const raw = await readFile(composicionesDbPath, "utf8");
    const parsed = JSON.parse(raw) as ApiComposicionSalarial[];
    composicionesStore = Array.isArray(parsed) ? parsed : [];
  } catch {
    composicionesStore = [];
    await persistComposicionesStore();
  }
}

async function persistComposicionesStore(): Promise<void> {
  await mkdir(dirname(composicionesDbPath), { recursive: true });
  await writeFile(composicionesDbPath, JSON.stringify(composicionesStore, null, 2), "utf8");
}

app.get("/health", async () => ({ ok: true }));

app.get("/concepts", async () => repo.list());

app.post<{ Body: ConceptDefinition }>("/concepts", async (req) => {
  await repo.save(req.body);
  return { ok: true };
});

app.put<{ Body: ConceptDefinition[] }>("/concepts", async (req) => {
  await repo.replaceAll(req.body ?? []);
  return { ok: true };
});

app.delete<{ Params: { id: string } }>("/concepts/:id", async (req) => {
  await repo.delete(Number(req.params.id));
  return { ok: true };
});

app.get("/legajos", async () => legajosStore);

app.put<{ Body: ApiLegajo[] }>("/legajos", async (req) => {
  legajosStore = Array.isArray(req.body) ? req.body : [];
  await persistLegajosStore();
  return { ok: true };
});

app.get("/liquidaciones", async () => liquidacionesStore);

app.post<{ Body: ApiLiquidacionRecord }>("/liquidaciones", async (req) => {
  if (!req.body?.id) return { ok: false };
  const normalized: ApiLiquidacionRecord = {
    ...req.body,
    estado: req.body.estado === "Anulada" ? "Anulada" : "Generada"
  };
  liquidacionesStore = [normalized, ...liquidacionesStore.filter((item) => item.id !== req.body.id)];
  await persistLiquidacionesStore();
  return { ok: true };
});

app.put<{ Params: { id: string }; Body: { estado: "Generada" | "Anulada" } }>(
  "/liquidaciones/:id/estado",
  async (req) => {
    const nextEstado = req.body?.estado === "Anulada" ? "Anulada" : "Generada";
    liquidacionesStore = liquidacionesStore.map((item) =>
      item.id === req.params.id ? { ...item, estado: nextEstado } : item
    );
    await persistLiquidacionesStore();
    return { ok: true };
  }
);

app.delete<{ Params: { id: string } }>("/liquidaciones/:id", async (req) => {
  liquidacionesStore = liquidacionesStore.map((item) =>
    item.id === req.params.id ? { ...item, estado: "Anulada" } : item
  );
  await persistLiquidacionesStore();
  return { ok: true };
});

app.get("/convenios", async () => conveniosStore);

app.get("/composiciones-salariales", async () => composicionesStore);

app.put<{ Body: ApiComposicionSalarial[] }>("/composiciones-salariales", async (req) => {
  composicionesStore = Array.isArray(req.body) ? req.body : [];
  await persistComposicionesStore();
  return { ok: true };
});

app.post<{
  Body: { params: Record<string, number>; fixedValuesByCode?: Record<string, number> };
}>("/liquidaciones/run", async (req) => {
  const concepts = await repo.list();
  const out = runPayroll({
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
  await initLegajosStore();
  await initLiquidacionesStore();
  await initConveniosStore();
  await initComposicionesStore();
  app.log.info(`Legajos DB file: ${legajosDbPath}`);
  app.log.info(`Liquidaciones DB file: ${liquidacionesDbPath}`);
  app.log.info(`Convenios DB file: ${conveniosDbPath}`);
  app.log.info(`Composiciones DB file: ${composicionesDbPath}`);
  await app.listen({ port: 3001, host: "0.0.0.0" });
};

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
