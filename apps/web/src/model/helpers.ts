import { exampleValues } from "./constants";
import { parseFunctionBlock, serializeFunctionBlock, splitBlockArgs } from "./function-blocks";
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
  /CONCEPTO\(\d+\)|CCONCEPTO\("[^"]+"\)|SUM_TAG\("[^"]+"\)|PARAM\("[^"]+"\)|TAG_OP\("(sum|avg|max|min)","[^"]+"\)|CONSTANTE\("([^"\\]|\\.)*"\)|MATH\("([^"\\]|\\.)*"\)/g;

interface TokenizeOptions {
  conceptCodeById?: Record<number, string>;
}

function isSingleBracketBlockStart(expression: string, index: number): boolean {
  if (expression[index] !== "[") return false;
  const next = expression[index + 1] ?? "";
  if (!/[A-Za-z_]/.test(next)) return false;
  const close = expression.indexOf("]", index + 1);
  if (close === -1) return false;
  const pipe = expression.indexOf("|", index + 1);
  if (pipe === -1 || pipe > close) return false;
  return true;
}

function parseBlockToken(value: string): FormulaToken | null {
  const parsed = parseFunctionBlock(value);
  if (!parsed) return null;
  return token(parsed.name, value.trim(), "block");
}

function pushChunkTokens(chunk: string, out: FormulaToken[]): void {
  const value = chunk.trim();
  if (!value) return;
  const siExpanded = expandSiToken(value);
  if (siExpanded) out.push(...siExpanded);
  else out.push(token(value, value, "text"));
}

function pushKnownAndTextTokens(
  chunk: string,
  out: FormulaToken[],
  options?: TokenizeOptions
): void {
  if (!chunk.trim()) return;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  knownExpressionRegex.lastIndex = 0;

  while ((match = knownExpressionRegex.exec(chunk)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const before = chunk.slice(lastIndex, start);
    pushChunkTokens(before, out);

    const expr = match[0];
    const { label, kind } = labelForKnownExpression(expr, options);
    out.push(token(label, expr, kind));
    lastIndex = end;
  }

  const tail = chunk.slice(lastIndex);
  pushChunkTokens(tail, out);
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
  const blockExpr = serializeFunctionBlock("SI", [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""]);
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

  const constante = expression.match(/^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/);
  if (constante) {
    const value = constante[1].replace(/\\"/g, "\"");
    return { label: value, kind: "function" };
  }

  const math = expression.match(/^MATH\("((?:[^"\\]|\\.)*)"\)$/);
  if (math) {
    const op = math[1].replace(/\\"/g, "\"");
    return { label: op, kind: "function" };
  }

  return { label: expression, kind: "text" };
}

export function tokenizeFormulaExpression(expression: string, options?: TokenizeOptions): FormulaToken[] {
  if (!expression.trim()) return [];

  const wholeBlock = parseBlockToken(expression);
  if (wholeBlock) return [wholeBlock];

  const tokens: FormulaToken[] = [];
  let i = 0;
  let plain = "";
  while (i < expression.length) {
    if (!isSingleBracketBlockStart(expression, i)) {
      plain += expression[i];
      i += 1;
      continue;
    }

    if (plain.trim()) {
      pushKnownAndTextTokens(plain, tokens, options);
      plain = "";
    }

    let depth = 1;
    let j = i + 1;
    while (j < expression.length && depth > 0) {
      if (isSingleBracketBlockStart(expression, j)) {
        depth += 1;
        j += 1;
        continue;
      }
      if (expression[j] === "]") {
        depth -= 1;
        j += 1;
        continue;
      }
      j += 1;
    }
    const blockRaw = expression.slice(i, j);
    const block = parseBlockToken(blockRaw);
    if (block) tokens.push(block);
    else pushChunkTokens(blockRaw, tokens);
    i = j;
  }

  if (plain.trim()) {
    pushKnownAndTextTokens(plain, tokens, options);
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
