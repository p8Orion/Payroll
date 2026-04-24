import { astToTokens } from "./formula-dnd";
import {
  expandBracketBlocksToExpressions,
  normalizeExcelComparators,
  normalizeExcelIf
} from "./function-blocks";
import { formulaToExpression } from "./helpers";
import { ConceptModel, TagAggregationOp } from "./types";

export interface LegajoLike {
  valoresFijos: Array<{ clave?: string; concepto?: string; valor: number }>;
  composicionValoresFijos?: Array<{ clave?: string; concepto?: string; valor: number }>;
}

interface EvalParams {
  concepts: ConceptModel[];
  conceptCodeById: Record<number, string>;
  legajo: LegajoLike | null;
  selectedConceptId?: number;
  params?: Record<string, number>;
}

export interface EvalResult {
  values: Map<number, unknown>;
  errors: Map<number, boolean>;
  dagOrderById: Map<number, number>;
  cycleIds: Set<number>;
  selectedValue: unknown | null;
  selectedError: string | null;
}

function conceptExpression(concept: ConceptModel): string {
  return formulaToExpression(astToTokens(concept.formulaAst ?? []));
}

function applyImplicitPlusBetweenValues(expression: string): string {
  return expression.replace(
    /(\)|-?\d+(?:\.\d+)?)(\s+)(?=(?:\(|-?\d+(?:\.\d+)?|IF\s*\())/g,
    "$1 + "
  );
}

function toExpressionLiteral(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "null";
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function toNumericOrZero(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getValorLegajo(legajo: LegajoLike | null, concepto: string, fallbackConcepto: string): number {
  if (!legajo) return 0;
  const requested = concepto.trim();
  const effectiveConcepto = requested.length ? requested : fallbackConcepto;
  const key = effectiveConcepto.trim().toLowerCase();
  if (!key) return 0;
  const found = legajo.valoresFijos.find(
    (vf) => ((vf.clave ?? vf.concepto ?? "").trim().toLowerCase() === key)
  );
  if (found) return found.valor;
  const foundComposicion = (legajo.composicionValoresFijos ?? []).find(
    (vf) => ((vf.clave ?? vf.concepto ?? "").trim().toLowerCase() === key)
  );
  return foundComposicion?.valor ?? 0;
}

function resolveValorLegajoConceptCode(
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

export function evaluateConcepts({
  concepts,
  conceptCodeById,
  legajo,
  selectedConceptId,
  params = { porc_antiguedad: 0.12 }
}: EvalParams): EvalResult {
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const conceptIdByCode = new Map(concepts.map((c) => [c.code, c.id]));
  const incoming = new Map<number, number>();
  const outgoing = new Map<number, number[]>();
  const ids = concepts.map((c) => c.id);
  for (const id of ids) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }

  const conceptIdRefs = /CONCEPTO\((\d+)\)/g;
  const conceptCodeRefs = /CCONCEPTO\("([^"]+)"\)/g;
  const sumTagRefs = /SUM_TAG\("([^"]+)"\)/g;
  const tagOpRefs = /TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g;

  for (const concept of concepts) {
    const expression = conceptExpression(concept);
    const seenDeps = new Set<number>();
    for (const m of expression.matchAll(conceptIdRefs)) {
      const depId = Number(m[1]);
      if (!conceptById.has(depId) || depId === concept.id || seenDeps.has(depId)) continue;
      seenDeps.add(depId);
      outgoing.get(depId)?.push(concept.id);
      incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
    }
    for (const m of expression.matchAll(conceptCodeRefs)) {
      const depId = conceptIdByCode.get(m[1]);
      if (!depId || depId === concept.id || seenDeps.has(depId)) continue;
      seenDeps.add(depId);
      outgoing.get(depId)?.push(concept.id);
      incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
    }
    const tagDeps = new Set<string>();
    for (const m of expression.matchAll(sumTagRefs)) tagDeps.add(m[1]);
    for (const m of expression.matchAll(tagOpRefs)) tagDeps.add(m[2]);
    for (const tag of tagDeps) {
      for (const depConcept of concepts) {
        if (!depConcept.tags.includes(tag)) continue;
        if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
        seenDeps.add(depConcept.id);
        outgoing.get(depConcept.id)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
    }
  }

  const topoIncoming = new Map(incoming);
  const queue = ids.filter((id) => (topoIncoming.get(id) ?? 0) === 0);
  const topo: number[] = [];
  const dagOrderById = new Map<number, number>();
  let order = 1;
  while (queue.length) {
    const current = queue.shift()!;
    topo.push(current);
    if (!dagOrderById.has(current)) dagOrderById.set(current, order++);
    for (const next of outgoing.get(current) ?? []) {
      const left = (topoIncoming.get(next) ?? 0) - 1;
      topoIncoming.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  const cycleIds = new Set(ids.filter((id) => (topoIncoming.get(id) ?? 0) > 0));
  for (const id of ids) if (!topo.includes(id)) topo.push(id);
  for (const id of ids) if (!dagOrderById.has(id)) dagOrderById.set(id, order++);

  const values = new Map<number, unknown>();
  const errors = new Map<number, boolean>();
  let selectedError: string | null = null;

  for (const id of topo) {
    const concept = conceptById.get(id);
    if (!concept) continue;
    const expression = conceptExpression(concept);
    if (!expression.trim()) {
      values.set(id, 0);
      errors.set(id, false);
      continue;
    }
    try {
      const normalized = expandBracketBlocksToExpressions(expression)
        .replace(/VALOR_FIJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
          const code = resolveValorLegajoConceptCode(rawArg, concept.code, conceptCodeById);
          return String(getValorLegajo(legajo, code, concept.code));
        })
        .replace(/VALOR_LEGAJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
          const code = resolveValorLegajoConceptCode(rawArg, concept.code, conceptCodeById);
          return String(getValorLegajo(legajo, code, concept.code));
        })
        .replace(/VALOR_FIJO\("([^"]*)"\)/g, (_, conceptoRaw: string) =>
          String(getValorLegajo(legajo, conceptoRaw, concept.code))
        )
        .replace(/VALOR_LEGAJO\("([^"]*)"\)/g, (_, conceptoRaw: string) =>
          String(getValorLegajo(legajo, conceptoRaw, concept.code))
        )
        .replace(/CONCEPTO\((\d+)\)/g, (_, refId: string) => {
          const value = values.get(Number(refId));
          if (value === undefined) throw new Error("missing CONCEPTO dep");
          return toExpressionLiteral(value);
        })
        .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, refCode: string) => {
          const refId = conceptIdByCode.get(refCode);
          if (!refId) throw new Error("missing CCONCEPTO code");
          const value = values.get(refId);
          if (value === undefined) throw new Error("missing CCONCEPTO dep");
          return toExpressionLiteral(value);
        })
        .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
          const sum = concepts
            .filter((c) => c.tags.includes(tag))
            .reduce((acc, c) => acc + toNumericOrZero(values.get(c.id)), 0);
          return String(sum);
        })
        .replace(/PARAM\("([^"]+)"\)/g, (_, paramName: string) => {
          const value = params[paramName];
          if (value === undefined) throw new Error("missing PARAM");
          return String(value);
        })
        .replace(/TAG_OP\("([^"]+)","([^"]+)"\)/g, (_, op: TagAggregationOp, tag: string) => {
          const tagged = concepts
            .filter((c) => c.tags.includes(tag))
            .map((c) => toNumericOrZero(values.get(c.id)));
          if (!tagged.length) return "0";
          if (op === "avg") return String(tagged.reduce((a, b) => a + b, 0) / tagged.length);
          if (op === "max") return String(Math.max(...tagged));
          if (op === "min") return String(Math.min(...tagged));
          return String(tagged.reduce((a, b) => a + b, 0));
        })
        .replace(/CONSTANTE\("((?:[^"\\]|\\.)*)"\)/g, (_, raw: string) => {
          const value = raw.replace(/\\"/g, "\"");
          const asNumber = Number(value);
          if (!Number.isNaN(asNumber) && value.trim() !== "") return String(asNumber);
          return JSON.stringify(value);
        })
        .replace(/MATH\("((?:[^"\\]|\\.)*)"\)/g, (_, raw: string) => raw.replace(/\\"/g, "\""))
        .replace(/%\s*(-?\d+(?:\.\d+)?)/g, "* ($1) / 100")
        .replace(/(-?\d+(?:\.\d+)?)\s*%/g, "($1 / 100)")
        .replace(/\[/g, "(")
        .replace(/\]/g, ")");

      const excelLike = normalizeExcelComparators(
        normalizeExcelIf(applyImplicitPlusBetweenValues(normalized))
      );
      const result = Function(
        `"use strict"; const IF = (cond, v, f) => (cond ? v : f); return (${excelLike});`
      )();
      values.set(id, result);
      errors.set(id, false);
    } catch (error) {
      values.set(id, 0);
      errors.set(id, true);
      if (selectedConceptId === id && !selectedError) {
        selectedError = error instanceof Error ? error.message : "error de compilacion";
      }
    }
  }

  return {
    values,
    errors,
    dagOrderById,
    cycleIds,
    selectedValue: selectedConceptId ? (values.get(selectedConceptId) ?? null) : null,
    selectedError
  };
}
