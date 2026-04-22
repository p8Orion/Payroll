import { PayrollContext } from "@rrsh/shared-types";

const conceptByIdRegex = /CONCEPTO\((\d+)\)/g;
const conceptByCodeRegex = /CCONCEPTO\("([^"]+)"\)/g;
const sumTagRegex = /SUM_TAG\("([^"]+)"\)/g;
const paramRegex = /PARAM\("([^"]+)"\)/g;

export interface FormulaDependencies {
  conceptIds: number[];
  conceptCodes: string[];
  tags: string[];
  params: string[];
}

export function extractDependencies(formula: string): FormulaDependencies {
  const ids = [...formula.matchAll(conceptByIdRegex)].map((m) => Number(m[1]));
  const codes = [...formula.matchAll(conceptByCodeRegex)].map((m) => m[1]);
  const tags = [...formula.matchAll(sumTagRegex)].map((m) => m[1]);
  const params = [...formula.matchAll(paramRegex)].map((m) => m[1]);

  return {
    conceptIds: [...new Set(ids)],
    conceptCodes: [...new Set(codes)],
    tags: [...new Set(tags)],
    params: [...new Set(params)]
  };
}

export function evaluateFormula(formula: string, ctx: PayrollContext): number {
  const normalized = formula
    .replace(conceptByIdRegex, (_, id) => String(ctx.valuesByConceptId[Number(id)] ?? 0))
    .replace(conceptByCodeRegex, (_, code) => String(ctx.valuesByConceptCode[code] ?? 0))
    .replace(sumTagRegex, (_, tag) => String(ctx.sumsByTag[tag] ?? 0))
    .replace(paramRegex, (_, name) => String(ctx.params[name] ?? 0));

  // Se evalua formula ya normalizada y controlada por DSL.
  const value = Function(`"use strict"; return (${normalized});`)();
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Formula invalida: ${formula}`);
  }
  return value;
}

export function topologicalSort(nodes: number[], edges: Array<[number, number]>): number[] {
  const incoming = new Map<number, number>();
  const outgoing = new Map<number, number[]>();
  for (const node of nodes) {
    incoming.set(node, 0);
    outgoing.set(node, []);
  }
  for (const [from, to] of edges) {
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
    outgoing.get(from)?.push(to);
  }

  const queue = nodes.filter((n) => (incoming.get(n) ?? 0) === 0);
  const sorted: number[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const next of outgoing.get(current) ?? []) {
      incoming.set(next, (incoming.get(next) ?? 0) - 1);
      if ((incoming.get(next) ?? 0) === 0) {
        queue.push(next);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error("Dependencias ciclicas detectadas en formulas.");
  }
  return sorted;
}
