export const functionBlockTemplates = {
  SI: {
    blockTitle: "SI",
    branches: ["CONDICIÓN", "ENTONCES", "SI NO"] as const
  },
  BLOQUE: {
    blockTitle: "BLOQUE",
    branches: [""] as const
  },
  TOPE: {
    blockTitle: "TOPE",
    branches: ["VALOR", "MÁXIMO"] as const
  },
  VALOR_LEGAJO: {
    blockTitle: "VALOR_LEGAJO",
    branches: ["CONCEPTO"] as const
  }
} as const;

export interface FunctionBlockModel {
  name: string;
  args: string[];
}

export function getFunctionBlockArity(name: string): number {
  const key = name.trim().toUpperCase() as keyof typeof functionBlockTemplates;
  const template = functionBlockTemplates[key];
  return template ? template.branches.length : 3;
}

function findBlockEnd(expression: string, start: number): number {
  if (!isSingleBracketBlockStart(expression, start)) return -1;
  let depth = 1;
  let i = start + 1;
  while (i < expression.length && depth > 0) {
    if (isSingleBracketBlockStart(expression, i)) {
      depth += 1;
      i += 1;
      continue;
    }
    if (expression[i] === "]") {
      depth -= 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return depth === 0 ? i : -1;
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

export function splitBlockArgs(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "[") {
      depth += 1;
      current += raw[i];
      continue;
    }
    if (raw[i] === "]" && depth > 0) {
      depth -= 1;
      current += raw[i];
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

export function parseFunctionBlock(expression: string): FunctionBlockModel | null {
  const trimmed = expression.trim();
  const end = findBlockEnd(trimmed, 0);
  if (end !== trimmed.length) return null;
  let inner = "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    inner = trimmed.slice(1, -1);
  } else {
    return null;
  }
  if (!inner.includes("|")) return null;
  const args = splitBlockArgs(inner);
  if (!args.length) return null;
  const name = (args[0] ?? "").trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) return null;
  return { name, args: args.slice(1) };
}

export function serializeFunctionBlock(name: string, args: string[]): string {
  return `[${name}|${args.join("|")}]`;
}

export function normalizeExcelIf(expression: string): string {
  let out = "";
  let depth = 0;
  const ifStack: number[] = [];

  for (let i = 0; i < expression.length; i++) {
    if (expression.startsWith("SI(", i)) {
      out += "IF(";
      depth += 1;
      ifStack.push(depth);
      i += 2;
      continue;
    }

    const ch = expression[i];
    if (ch === "(") {
      depth += 1;
      out += ch;
      continue;
    }
    if (ch === ")") {
      if (ifStack.length && ifStack[ifStack.length - 1] === depth) ifStack.pop();
      depth = Math.max(0, depth - 1);
      out += ch;
      continue;
    }
    if (ch === ";" && ifStack.length > 0) {
      out += ",";
      continue;
    }
    out += ch;
  }

  return out;
}

export function normalizeExcelComparators(expression: string): string {
  return expression.replace(/<>/g, "!=").replace(/(?<![<>=!])=(?!=)/g, "==");
}

export function expandBracketBlocksToExpressions(expression: string): string {
  let out = "";
  let i = 0;
  while (i < expression.length) {
    if (!isSingleBracketBlockStart(expression, i)) {
      out += expression[i];
      i += 1;
      continue;
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
    const block = parseFunctionBlock(blockRaw);
    if (!block) {
      out += blockRaw;
      i = j;
      continue;
    }
    if (block.name === "SI") {
      const cond = expandBracketBlocksToExpressions(block.args[0] ?? "");
      const whenTrue = expandBracketBlocksToExpressions(block.args[1] ?? "");
      const whenFalse = expandBracketBlocksToExpressions(block.args[2] ?? "");
      out += `SI(${cond};${whenTrue};${whenFalse})`;
    } else if (block.name === "BLOQUE") {
      const inner = expandBracketBlocksToExpressions(block.args[0] ?? "");
      out += `(${inner})`;
    } else if (block.name === "TOPE") {
      const value = expandBracketBlocksToExpressions(block.args[0] ?? "");
      const max = expandBracketBlocksToExpressions(block.args[1] ?? "");
      out += `Math.min((${value || "0"}),(${max || "0"}))`;
    } else if (block.name === "VALOR_LEGAJO") {
      const arg = (block.args[0] ?? "").trim();
      out += `VALOR_LEGAJO_ARG[[${arg}]]`;
    } else {
      out += blockRaw;
    }
    i = j;
  }
  return out;
}
