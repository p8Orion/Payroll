import { colorPalette30, shapeCycle } from "../../model/constants";
import { astToTokens, parseExpressionToAst } from "../../model/formula-dnd";
import { formulaToExpression } from "../../model/helpers";
import { ConceptModel, ConceptTypeId, LIQUIDATION_TYPES, LiquidationType, ReceiptModel } from "../../model/types";

export interface ApiConcept {
  id: number;
  code: string;
  name: string;
  conceptClass: "definitivo" | "transitorio";
  conceptType?: ConceptTypeId;
  f1359FieldId?: string;
  formula?: string;
  tags: string[];
}

export interface ApiReceipt {
  id: string;
  convenio: string;
  liquidationType: string;
  definitiveOrder: number[];
  transitoryOrder: number[];
}

export interface ApiF1359Field {
  id: string;
  registro: string;
  campo: string;
  descripcion: string;
  posicionInicial: number;
  posicionFinal: number;
  longitud: number;
}

export interface EditorSnapshot {
  concepts: ConceptModel[];
  receipts: ReceiptModel[];
}

export const apiBaseUrl = "http://localhost:3001";
export const legacyReceiptsStorageKey = "rrsh.receipts.v1";
export const receiptF1359FilterStorageKey = "rrsh.receipt-f1359-filter.v1";
export const receiptTagFilterStorageKey = "rrsh.receipt-tag-filter.v1";
export const maxHistoryEntries = 200;
export const defaultConvenios = ["Luz y Fuerza", "Apuaye", "Comercio"];
export const genericDefaultConvenio = "(Por defecto)";
export const filterAllOption = "(Todos)";
export const annualAllLiquidationTypes = "(Todos)";
export const simulationMonthOptions = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" }
] as const;
export const implicitTypeTagValues = new Set<string>([
  "remunerativo",
  "no_remunerativo",
  "descuentos",
  "aportes_patronales",
  "no-remunerativo",
  "aportes-patronales"
]);

export const implicitTagForType = (type: ConceptTypeId): string => {
  if (type === "no_remunerativo") return "no-remunerativo";
  if (type === "aportes_patronales") return "aportes-patronales";
  return type;
};

export const normalizeTagsWithImplicitType = (tags: string[], type: ConceptTypeId): string[] => {
  const explicit = tags.filter((tag) => !implicitTypeTagValues.has(tag as ConceptTypeId));
  return [...new Set([...explicit, implicitTagForType(type)])];
};

export function receiptId(convenio: string, liquidationType: LiquidationType): string {
  return `${convenio}__${liquidationType}`;
}

export function normalizeReceipt(
  receipt: {
    id?: string;
    convenio?: string;
    name?: string;
    liquidationType?: string;
    definitiveOrder?: number[];
    transitoryOrder?: number[];
  },
  fallbackOrder: number[]
): ReceiptModel | null {
  const rawConvenio = (receipt.convenio ?? "").trim();
  const convenio = rawConvenio === "(Todos)" ? genericDefaultConvenio : rawConvenio;
  if (!convenio) return null;
  const liquid = LIQUIDATION_TYPES.includes(receipt.liquidationType as LiquidationType)
    ? (receipt.liquidationType as LiquidationType)
    : "Normal";
  return {
    id: receiptId(convenio, liquid),
    convenio,
    liquidationType: liquid,
    definitiveOrder: Array.isArray(receipt.definitiveOrder) ? receipt.definitiveOrder : fallbackOrder,
    transitoryOrder: Array.isArray((receipt as { transitoryOrder?: number[] }).transitoryOrder)
      ? ((receipt as { transitoryOrder?: number[] }).transitoryOrder as number[])
      : []
  };
}

export function ensureReceiptMatrix(
  receipts: ReceiptModel[],
  convenios: string[],
  fallbackOrder: number[]
): ReceiptModel[] {
  const byKey = new Map<string, ReceiptModel>();
  for (const raw of receipts) {
    const normalized = normalizeReceipt(raw, fallbackOrder);
    if (!normalized) continue;
    byKey.set(receiptId(normalized.convenio, normalized.liquidationType), normalized);
  }
  const next: ReceiptModel[] = [];
  for (const convenio of convenios) {
    for (const liquidationType of LIQUIDATION_TYPES) {
      const key = receiptId(convenio, liquidationType);
      next.push(
        byKey.get(key) ?? {
          id: key,
          convenio,
          liquidationType,
          definitiveOrder: [],
          transitoryOrder: []
        }
      );
    }
  }
  return next;
}

export function parseApiReceipt(
  receipt: ApiReceipt,
  fallbackOrder: number[]
): ReceiptModel | null {
  return normalizeReceipt(
    {
      id: receipt.id,
      convenio: receipt.convenio,
      liquidationType: receipt.liquidationType,
      definitiveOrder: receipt.definitiveOrder,
      transitoryOrder: receipt.transitoryOrder
    },
    fallbackOrder
  );
}

export function applyImplicitPlusBetweenValues(expression: string): string {
  return expression.replace(
    /(\)|-?\d+(?:\.\d+)?)(\s+)(?=(?:\(|-?\d+(?:\.\d+)?|IF\s*\())/g,
    "$1 + "
  );
}

export function toApiConcept(concept: ConceptModel): ApiConcept {
  return {
    id: concept.id,
    code: concept.code,
    name: concept.name,
    conceptClass: concept.conceptClass,
    conceptType: concept.conceptType,
    f1359FieldId: concept.f1359FieldId,
    formula: formulaToExpression(astToTokens(concept.formulaAst ?? [])),
    tags: concept.tags
  };
}

export function fromApiConcept(
  concept: ApiConcept,
  conceptCodeById: Record<number, string>
): ConceptModel {
  return {
    id: concept.id,
    code: concept.code,
    name: concept.name,
    conceptClass: concept.conceptClass,
    conceptType: concept.conceptType ?? "remunerativo",
    f1359FieldId: concept.f1359FieldId ?? "",
    color: colorPalette30[(concept.id - 1) % colorPalette30.length],
    shape: shapeCycle[(concept.id - 1) % shapeCycle.length],
    tags: concept.tags ?? [],
    formulaAst: concept.formula
      ? parseExpressionToAst(concept.formula, conceptCodeById)
      : []
  };
}

export async function persistConcept(concept: ConceptModel): Promise<void> {
  await fetch(`${apiBaseUrl}/concepts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiConcept(concept))
  });
}

type LegajoLikeForSimulation = {
  convenio?: string;
  composicionSalarial?: string;
  valoresFijos: Array<{ clave?: string; concepto?: string; valor: number }>;
};

type ComposicionLikeForSimulation = {
  id: string;
  code?: string;
  convenio?: string;
  valoresFijos: Array<{ clave?: string; concepto?: string; valor: number }>;
};

export function resolveComposicionLegajo(
  legajo: LegajoLikeForSimulation | null,
  composiciones: ComposicionLikeForSimulation[]
): ComposicionLikeForSimulation | undefined {
  if (!legajo) return undefined;
  const selected = (legajo.composicionSalarial ?? "").trim();
  if (!selected) return undefined;
  const normalize = (value: string | undefined): string => (value ?? "").trim().toLowerCase();
  const byId = composiciones.find(
    (c) =>
      c.id === selected &&
      normalize(c.convenio) === normalize(legajo.convenio)
  );
  if (byId) return byId;
  return composiciones.find(
    (c) =>
      normalize(c.code) === normalize(selected) &&
      normalize(c.convenio) === normalize(legajo.convenio)
  );
}

export function getValorLegajo(
  legajo: LegajoLikeForSimulation | null,
  composiciones: ComposicionLikeForSimulation[],
  concepto: string,
  fallbackConcepto: string
): number {
  if (!legajo) return 0;
  const requested = concepto.trim();
  const effectiveConcepto = requested.length ? requested : fallbackConcepto;
  const key = effectiveConcepto.trim().toLowerCase();
  if (!key) return 0;
  const foundLegajo = legajo.valoresFijos.find(
    (vf) => ((vf.clave ?? "").trim().toLowerCase() === key || ((vf as { concepto?: string }).concepto ?? "").trim().toLowerCase() === key)
  );
  if (foundLegajo) return foundLegajo.valor;
  const comp = resolveComposicionLegajo(legajo, composiciones);
  const foundComp = comp?.valoresFijos.find(
    (vf) => ((vf.clave ?? "").trim().toLowerCase() === key || ((vf as { concepto?: string }).concepto ?? "").trim().toLowerCase() === key)
  );
  return foundComp?.valor ?? 0;
}

export function resolveValorLegajoConceptCode(
  rawArg: string,
  fallbackConcepto: string,
  conceptCodeById: Record<number, string>
): string {
  const arg = rawArg.trim();
  if (!arg) return fallbackConcepto;

  const byCode = arg.match(/^CCONCEPTO\("([^"]+)"\)$/);
  if (byCode) return byCode[1];

  const byId = arg.match(/^CONCEPTO\((\d+)\)$/);
  if (byId) return conceptCodeById[Number(byId[1])] ?? "";

  const byConst = arg.match(/^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/);
  if (byConst) return byConst[1].replace(/\\"/g, "\"");

  const byQuoted = arg.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (byQuoted) return byQuoted[1].replace(/\\"/g, "\"");

  return arg;
}
