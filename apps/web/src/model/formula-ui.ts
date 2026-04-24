export function isConstExpression(expr: string): boolean {
  return /^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/.test(expr.trim());
}

export function parseConstValue(expr: string): string {
  const m = expr.trim().match(/^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/);
  if (!m) return "";
  return m[1].replace(/\\"/g, "\"");
}

export function buildConstExpression(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `CONSTANTE("${escaped}")`;
}

export function isMathOperatorText(value: string): boolean {
  return ["+", "-", "*", "/", "(", ")", "[", "]", "%", ">", "<", ">=", "<=", "=", "<>"].includes(
    value.trim()
  );
}

export function isMathExpression(expr: string): boolean {
  return /^MATH\("((?:[^"\\]|\\.)*)"\)$/.test(expr.trim());
}

export function isTagAggregationExpression(expr: string): boolean {
  const value = expr.trim();
  return /^SUM_TAG\("([^"]+)"\)$/.test(value) || /^TAG_OP\("(sum|avg|max|min)","([^"]+)"\)$/.test(value);
}
