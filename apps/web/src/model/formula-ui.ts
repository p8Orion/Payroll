export function isConstExpression(expr: string): boolean {
  return /^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/.test(expr.trim());
}

function extractConstRawValue(expr: string): string {
  const m = expr.trim().match(/^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/);
  if (!m) return "";
  return m[1].replace(/\\"/g, "\"");
}

function normalizeLocalizedNumberInput(value: string): string {
  const compact = value.trim().replace(/\s+/g, "");
  if (!compact) return "";
  const hasComma = compact.includes(",");
  if (hasComma) return compact.replace(/\./g, "").replace(",", ".");
  return compact;
}

export function parseLocalizedNumber(value: string): number | null {
  const normalized = normalizeLocalizedNumberInput(value);
  if (!normalized) return null;
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatLocalizedNumber(value: number): string {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 20 });
}

export function formatConstDisplayValue(value: string): string {
  const parsed = parseLocalizedNumber(value);
  if (parsed === null) return value;
  return formatLocalizedNumber(parsed);
}

export function parseConstValue(expr: string): string {
  return formatConstDisplayValue(extractConstRawValue(expr));
}

export function buildConstExpression(value: string): string {
  const parsed = parseLocalizedNumber(value);
  const canonical = parsed === null ? value : String(parsed);
  const escaped = canonical.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
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
