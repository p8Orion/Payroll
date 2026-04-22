export const functionBlockTemplates = {
  SI: {
    blockTitle: "SI",
    branches: ["CONDICIÓN", "ENTONCES", "SI NO"] as const
  }
} as const;

export interface FunctionBlockModel {
  name: string;
  args: string[];
}

export function splitBlockArgs(raw: string): string[] {
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

export function parseFunctionBlock(expression: string): FunctionBlockModel | null {
  const trimmed = expression.trim();
  if (!trimmed.startsWith("[[") || !trimmed.endsWith("]]")) return null;
  const inner = trimmed.slice(2, -2);
  const args = splitBlockArgs(inner);
  if (!args.length) return null;
  return { name: (args[0] ?? "").trim().toUpperCase(), args: args.slice(1) };
}

export function serializeFunctionBlock(name: string, args: string[]): string {
  return `[[${name}|${args.join("|")}]]`;
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
    const two = expression.slice(i, i + 2);
    if (two !== "[[") {
      out += expression[i];
      i += 1;
      continue;
    }
    let depth = 1;
    let j = i + 2;
    while (j < expression.length && depth > 0) {
      const nextTwo = expression.slice(j, j + 2);
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
    } else {
      out += blockRaw;
    }
    i = j;
  }
  return out;
}
