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

const repo: ConceptRepository =
  process.env.NODE_ENV === "production"
    ? new InMemoryConceptRepository()
    : new FileBackedConceptRepository(new InMemoryConceptRepository(), diskDbPath);

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
  await app.listen({ port: 3001, host: "0.0.0.0" });
};

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
