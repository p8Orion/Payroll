import { exampleValues } from "./constants";
import { ConceptShape, FormulaToken, TagAggregationOp } from "./types";

const nextTokenId = (() => {
  let id = 0;
  return () => `tk_${++id}`;
})();

export function token(label: string, expression: string, kind: FormulaToken["kind"]): FormulaToken {
  return { id: nextTokenId(), label, expression, kind };
}

export function formulaToExpression(tokens: FormulaToken[]): string {
  return tokens.map((t) => t.expression).join(" ");
}

const knownExpressionRegex =
  /CONCEPTO\(\d+\)|CCONCEPTO\("[^"]+"\)|SUM_TAG\("[^"]+"\)|PARAM\("[^"]+"\)|TAG_OP\("(sum|avg|max|min)","[^"]+"\)/g;

interface TokenizeOptions {
  conceptCodeById?: Record<number, string>;
}

function splitSiArguments(raw: string): [string, string, string] | null {
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "(") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (ch === ";" && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  args.push(current.trim());
  if (args.length !== 3) return null;
  return [args[0], args[1], args[2]];
}

function expandSiToken(value: string): FormulaToken[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("SI(") || !trimmed.endsWith(")")) return null;
  const inner = trimmed.slice(3, -1);
  const parts = splitSiArguments(inner);
  if (!parts) return null;
  return [
    token("SI", "SI(", "function"),
    token("CONDICIÓN", `${parts[0] || ""};`, "slot"),
    token("ENTONCES", `${parts[1]};`, "slot"),
    token("SI NO", `${parts[2]})`, "slot")
  ];
}

function labelForKnownExpression(
  expression: string,
  options?: TokenizeOptions
): { label: string; kind: FormulaToken["kind"] } {
  const conceptId = expression.match(/^CONCEPTO\((\d+)\)$/);
  if (conceptId) {
    const id = Number(conceptId[1]);
    return { label: options?.conceptCodeById?.[id] ?? `C${id}`, kind: "concept" };
  }

  const conceptCode = expression.match(/^CCONCEPTO\("([^"]+)"\)$/);
  if (conceptCode) return { label: conceptCode[1], kind: "concept" };

  const sumTag = expression.match(/^SUM_TAG\("([^"]+)"\)$/);
  if (sumTag) return { label: `Suma #${sumTag[1]}`, kind: "function" };

  const param = expression.match(/^PARAM\("([^"]+)"\)$/);
  if (param) return { label: `Parametro ${param[1]}`, kind: "param" };

  const tagOp = expression.match(/^TAG_OP\("(sum|avg|max|min)","([^"]+)"\)$/);
  if (tagOp) {
    const map = { sum: "Suma", avg: "Promedio", max: "Maximo", min: "Minimo" } as const;
    return { label: `${map[tagOp[1] as keyof typeof map]} #${tagOp[2]}`, kind: "function" };
  }

  return { label: expression, kind: "text" };
}

export function tokenizeFormulaExpression(expression: string, options?: TokenizeOptions): FormulaToken[] {
  if (!expression.trim()) return [];

  const tokens: FormulaToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = knownExpressionRegex.exec(expression)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    const before = expression.slice(lastIndex, start).trim();
    if (before) {
      const siExpanded = expandSiToken(before);
      if (siExpanded) {
        tokens.push(...siExpanded);
      } else {
        tokens.push(token(before, before, "text"));
      }
    }

    const expr = match[0];
    const { label, kind } = labelForKnownExpression(expr, options);
    tokens.push(token(label, expr, kind));
    lastIndex = end;
  }

  const tail = expression.slice(lastIndex).trim();
  if (tail) {
    const siExpanded = expandSiToken(tail);
    if (siExpanded) {
      tokens.push(...siExpanded);
    } else {
      tokens.push(token(tail, tail, "text"));
    }
  }

  return tokens;
}

export function getShapeGlyph(shape: ConceptShape): string {
  if (shape === "triangle") return "▲";
  if (shape === "diamond") return "◆";
  if (shape === "plus") return "✚";
  if (shape === "hex") return "⬢";
  if (shape === "square") return "■";
  if (shape === "star") return "★";
  return "●";
}

export function evaluatePreview(expression: string): number | null {
  const normalized = expression
    .replace(/CONCEPTO\((\d+)\)/g, (_, id) => {
      const value = exampleValues.conceptById[Number(id) as keyof typeof exampleValues.conceptById];
      return String(value ?? 0);
    })
    .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, code: string) => {
      const value = exampleValues.conceptByCode[code as keyof typeof exampleValues.conceptByCode];
      return String(value ?? 0);
    })
    .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
      const value = exampleValues.tagSums[tag as keyof typeof exampleValues.tagSums];
      return String(value ?? 0);
    })
    .replace(/PARAM\("([^"]+)"\)/g, (_, param: string) => {
      const value = exampleValues.params[param as keyof typeof exampleValues.params];
      return String(value ?? 0);
    })
    .replace(/TAG_OP\("([^"]+)","([^"]+)"\)/g, (_, op: TagAggregationOp, tag: string) => {
      const base = exampleValues.tagSums[tag as keyof typeof exampleValues.tagSums] ?? 0;
      if (op === "avg") return String(base / 2);
      if (op === "max") return String(base);
      if (op === "min") return String(base / 4);
      return String(base);
    })
    .replace(/\[/g, "(")
    .replace(/\]/g, ")");

  try {
    const result = Function(`"use strict"; return (${normalized});`)();
    return typeof result === "number" && !Number.isNaN(result) ? result : null;
  } catch {
    return null;
  }
}
