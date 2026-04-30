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
const receiptsDbPath =
  process.env.RECEIPTS_DB_FILE ??
  resolve(process.cwd(), ".test-db", "receipts.json");
const conveniosDbPath =
  process.env.CONVENIOS_DB_FILE ??
  resolve(process.cwd(), ".test-db", "convenios.json");
const composicionesDbPath =
  process.env.COMPOSICIONES_DB_FILE ??
  resolve(process.cwd(), ".test-db", "composiciones-salariales.json");
const f1359FieldsDbPath =
  process.env.F1359_FIELDS_DB_FILE ??
  resolve(process.cwd(), ".test-db", "f1359-fields.json");
const gananciasTablesDbPath =
  process.env.GANANCIAS_TABLES_DB_FILE ??
  resolve(process.cwd(), ".test-db", "ganancias-tablas.json");
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

interface ApiReceiptRecord {
  id: string;
  convenio: string;
  liquidationType: string;
  definitiveOrder: number[];
  transitoryOrder: number[];
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

interface ApiF1359Field {
  id: string;
  registro: string;
  campo: string;
  descripcion: string;
  posicionInicial: number;
  posicionFinal: number;
  longitud: number;
}

interface ApiGananciasScaleRow {
  fromAmount: number;
  toAmount: number | null;
  fixedTax: number;
  percentRate: number;
  excessOver: number;
}

interface ApiGananciasDeducciones {
  gananciaNoImponible: number;
  conyuge: number;
  hijo: number;
  hijoIncapacitado: number;
  deduccionEspecialGeneral: number;
  deduccionEspecialNuevos: number;
  deduccionEspecialIncisoD: number;
}

interface ApiGananciasTableRecord {
  year: number;
  month: number;
  sourcePeriod: string;
  sourceUrlArt30: string;
  sourceUrlArt94: string;
  publishedAt: string;
  deducciones: ApiGananciasDeducciones;
  escala: ApiGananciasScaleRow[];
}

const repo = new FileBackedConceptRepository(
  new InMemoryConceptRepository(),
  diskDbPath
);
let legajosStore: ApiLegajo[] = [];
let liquidacionesStore: ApiLiquidacionRecord[] = [];
let receiptsStore: ApiReceiptRecord[] = [];
let conveniosStore: string[] = [...fixedConvenios];
let composicionesStore: ApiComposicionSalarial[] = [];
let f1359FieldsStore: ApiF1359Field[] = [];
let gananciasTablesStore: ApiGananciasTableRecord[] = [];

const officialArt30Url2026 =
  "https://www.afip.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/deducciones/documentos/Deducciones-personales-art-30-ene-a-jun-2026.pdf";
const officialArt94Url2026 =
  "https://www.afip.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/declaracion-jurada/documentos/Tabla-Art-94-LIG-per-ene-a-jun-2026.pdf";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function proportionalAccumulated(annual: number, month: number): number {
  return round2((annual / 12) * month);
}

function buildGananciasSeed2026(): ApiGananciasTableRecord[] {
  const annualDeducciones: ApiGananciasDeducciones = {
    gananciaNoImponible: 5151802.5,
    conyuge: 4851964.66,
    hijo: 2446863.48,
    hijoIncapacitado: 4893726.96,
    deduccionEspecialGeneral: 18031308.76,
    deduccionEspecialNuevos: 20607210.01,
    deduccionEspecialIncisoD: 24728652.02
  };

  const annualScale: ApiGananciasScaleRow[] = [
    { fromAmount: 0, toAmount: 2000030.09, fixedTax: 0, percentRate: 5, excessOver: 0 },
    { fromAmount: 2000030.09, toAmount: 4000060.17, fixedTax: 100001.5, percentRate: 9, excessOver: 2000030.09 },
    { fromAmount: 4000060.17, toAmount: 6000090.26, fixedTax: 280004.21, percentRate: 12, excessOver: 4000060.17 },
    { fromAmount: 6000090.26, toAmount: 9000135.4, fixedTax: 520007.82, percentRate: 15, excessOver: 6000090.26 },
    { fromAmount: 9000135.4, toAmount: 18000270.8, fixedTax: 970014.59, percentRate: 19, excessOver: 9000135.4 },
    { fromAmount: 18000270.8, toAmount: 27000406.2, fixedTax: 2680040.32, percentRate: 23, excessOver: 18000270.8 },
    { fromAmount: 27000406.2, toAmount: 40500609.3, fixedTax: 4750071.46, percentRate: 27, excessOver: 27000406.2 },
    { fromAmount: 40500609.3, toAmount: 60750913.96, fixedTax: 8395126.3, percentRate: 31, excessOver: 40500609.3 },
    { fromAmount: 60750913.96, toAmount: null, fixedTax: 14672720.74, percentRate: 35, excessOver: 60750913.96 }
  ];

  const rows: ApiGananciasTableRecord[] = [];
  for (let month = 1; month <= 12; month += 1) {
    rows.push({
      year: 2026,
      month,
      sourcePeriod: "2026-S1 official values projected monthly for yearly accumulation",
      sourceUrlArt30: officialArt30Url2026,
      sourceUrlArt94: officialArt94Url2026,
      publishedAt: "2026-01-01",
      deducciones: {
        gananciaNoImponible: proportionalAccumulated(annualDeducciones.gananciaNoImponible, month),
        conyuge: proportionalAccumulated(annualDeducciones.conyuge, month),
        hijo: proportionalAccumulated(annualDeducciones.hijo, month),
        hijoIncapacitado: proportionalAccumulated(annualDeducciones.hijoIncapacitado, month),
        deduccionEspecialGeneral: proportionalAccumulated(annualDeducciones.deduccionEspecialGeneral, month),
        deduccionEspecialNuevos: proportionalAccumulated(annualDeducciones.deduccionEspecialNuevos, month),
        deduccionEspecialIncisoD: proportionalAccumulated(annualDeducciones.deduccionEspecialIncisoD, month)
      },
      escala: annualScale.map((row) => ({
        fromAmount: proportionalAccumulated(row.fromAmount, month),
        toAmount: row.toAmount === null ? null : proportionalAccumulated(row.toAmount, month),
        fixedTax: proportionalAccumulated(row.fixedTax, month),
        percentRate: row.percentRate,
        excessOver: proportionalAccumulated(row.excessOver, month)
      }))
    });
  }
  return rows;
}

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

async function initReceiptsStore(): Promise<void> {
  try {
    const raw = await readFile(receiptsDbPath, "utf8");
    const parsed = JSON.parse(raw) as ApiReceiptRecord[];
    receiptsStore = Array.isArray(parsed) ? parsed : [];
  } catch {
    receiptsStore = [];
    await persistReceiptsStore();
  }
}

async function persistReceiptsStore(): Promise<void> {
  await mkdir(dirname(receiptsDbPath), { recursive: true });
  await writeFile(receiptsDbPath, JSON.stringify(receiptsStore, null, 2), "utf8");
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

async function initF1359FieldsStore(): Promise<void> {
  try {
    const raw = await readFile(f1359FieldsDbPath, "utf8");
    const parsed = JSON.parse(raw) as ApiF1359Field[];
    f1359FieldsStore = Array.isArray(parsed) ? parsed : [];
  } catch {
    f1359FieldsStore = [];
    await persistF1359FieldsStore();
  }
}

async function persistF1359FieldsStore(): Promise<void> {
  await mkdir(dirname(f1359FieldsDbPath), { recursive: true });
  await writeFile(f1359FieldsDbPath, JSON.stringify(f1359FieldsStore, null, 2), "utf8");
}

async function initGananciasTablesStore(): Promise<void> {
  try {
    const raw = await readFile(gananciasTablesDbPath, "utf8");
    const parsed = JSON.parse(raw) as ApiGananciasTableRecord[];
    gananciasTablesStore = Array.isArray(parsed) ? parsed : [];
    const seed = buildGananciasSeed2026();
    const byKey = new Map(gananciasTablesStore.map((row) => [`${row.year}-${row.month}`, row]));
    for (const row of seed) {
      const key = `${row.year}-${row.month}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, row);
        continue;
      }
      if (!Array.isArray(existing.escala) || existing.escala.length === 0) {
        byKey.set(key, { ...existing, escala: row.escala });
      }
    }
    gananciasTablesStore = Array.from(byKey.values());
    if (!gananciasTablesStore.length) gananciasTablesStore = seed;
    await persistGananciasTablesStore();
  } catch {
    gananciasTablesStore = buildGananciasSeed2026();
    await persistGananciasTablesStore();
  }
}

async function persistGananciasTablesStore(): Promise<void> {
  await mkdir(dirname(gananciasTablesDbPath), { recursive: true });
  const sorted = [...gananciasTablesStore].sort((a, b) => a.year - b.year || a.month - b.month);
  await writeFile(gananciasTablesDbPath, JSON.stringify(sorted, null, 2), "utf8");
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

app.get("/receipts", async () => receiptsStore);

app.put<{ Body: ApiReceiptRecord[] }>("/receipts", async (req) => {
  receiptsStore = Array.isArray(req.body) ? req.body : [];
  await persistReceiptsStore();
  return { ok: true };
});

app.get("/convenios", async () => conveniosStore);

app.get("/composiciones-salariales", async () => composicionesStore);

app.put<{ Body: ApiComposicionSalarial[] }>("/composiciones-salariales", async (req) => {
  composicionesStore = Array.isArray(req.body) ? req.body : [];
  await persistComposicionesStore();
  return { ok: true };
});

app.get("/f1359-fields", async () => f1359FieldsStore);

app.put<{ Body: ApiF1359Field[] }>("/f1359-fields", async (req) => {
  f1359FieldsStore = Array.isArray(req.body) ? req.body : [];
  await persistF1359FieldsStore();
  return { ok: true };
});

app.get("/ganancias-tablas", async () => gananciasTablesStore);

app.put<{ Body: ApiGananciasTableRecord[] }>("/ganancias-tablas", async (req) => {
  gananciasTablesStore = Array.isArray(req.body) ? req.body : [];
  await persistGananciasTablesStore();
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
  await repo.init();
  app.log.info(`Concept DB file: ${diskDbPath}`);
  await initLegajosStore();
  await initLiquidacionesStore();
  await initReceiptsStore();
  await initConveniosStore();
  await initComposicionesStore();
  await initF1359FieldsStore();
  await initGananciasTablesStore();
  app.log.info(`Legajos DB file: ${legajosDbPath}`);
  app.log.info(`Liquidaciones DB file: ${liquidacionesDbPath}`);
  app.log.info(`Receipts DB file: ${receiptsDbPath}`);
  app.log.info(`Convenios DB file: ${conveniosDbPath}`);
  app.log.info(`Composiciones DB file: ${composicionesDbPath}`);
  app.log.info(`F1359 Fields DB file: ${f1359FieldsDbPath}`);
  app.log.info(`Ganancias Tables DB file: ${gananciasTablesDbPath}`);
  await app.listen({ port: 3001, host: "0.0.0.0" });
};

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
