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

function splitBlockArgs(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < raw.length; i++) {
    const two = raw.slice(i, i + 2);
    if (two === "[[") {
      depth += 1;
      current += two;
      i += 1;
      continue;
    }
    if (two === "]]" && depth > 0) {
      depth -= 1;
      current += two;
      i += 1;
      continue;
    }
    if (raw[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += raw[i];
  }
  parts.push(current);
  return parts;
}

function parseBlockToken(value: string): FormulaToken | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[[") || !trimmed.endsWith("]]")) return null;
  const inner = trimmed.slice(2, -2);
  const [name] = splitBlockArgs(inner);
  if (!name) return null;
  return token(name.trim().toUpperCase(), trimmed, "block");
}

function pushChunkTokens(chunk: string, out: FormulaToken[]): void {
  const value = chunk.trim();
  if (!value) return;

  let i = 0;
  let buffer = "";
  while (i < value.length) {
    const two = value.slice(i, i + 2);
    if (two !== "[[") {
      buffer += value[i];
      i += 1;
      continue;
    }

    // Flush preceding text.
    if (buffer.trim()) {
      const siExpanded = expandSiToken(buffer.trim());
      if (siExpanded) out.push(...siExpanded);
      else out.push(token(buffer.trim(), buffer.trim(), "text"));
      buffer = "";
    }

    let depth = 1;
    let j = i + 2;
    while (j < value.length && depth > 0) {
      const nextTwo = value.slice(j, j + 2);
      if (nextTwo === "[[") {
        depth += 1;
        j += 2;
        continue;
      }
      if (nextTwo === "]]") {
        depth -= 1;
        j += 2;
        continue;
      }
      j += 1;
    }
    const blockRaw = value.slice(i, j);
    const block = parseBlockToken(blockRaw);
    if (block) out.push(block);
    else out.push(token(blockRaw, blockRaw, "text"));
    i = j;
  }

  if (buffer.trim()) {
    const siExpanded = expandSiToken(buffer.trim());
    if (siExpanded) out.push(...siExpanded);
    else out.push(token(buffer.trim(), buffer.trim(), "text"));
  }
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
  const blockExpr = `[[SI|${parts[0] ?? ""}|${parts[1] ?? ""}|${parts[2] ?? ""}]]`;
  return [token("SI", blockExpr, "block")];
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

  const wholeBlock = parseBlockToken(expression);
  if (wholeBlock) return [wholeBlock];

  const tokens: FormulaToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = knownExpressionRegex.exec(expression)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    const before = expression.slice(lastIndex, start);
    pushChunkTokens(before, tokens);

    const expr = match[0];
    const { label, kind } = labelForKnownExpression(expr, options);
    tokens.push(token(label, expr, kind));
    lastIndex = end;
  }

  const tail = expression.slice(lastIndex);
  pushChunkTokens(tail, tokens);

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
