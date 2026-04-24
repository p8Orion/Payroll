import { getFunctionBlockArity, parseFunctionBlock, serializeFunctionBlock } from "./function-blocks";
import { tokenizeFormulaExpression } from "./helpers";
import { FormulaToken } from "./types";

export type FormulaDragSource =
  | { kind: "root"; tokenId: string }
  | {
      kind: "nested";
      pathKey: string;
      argIndex: number;
      tokenIndex: number;
      token: FormulaToken;
    };

interface AstNodeBase {
  id: string;
  kind: FormulaToken["kind"];
  label: string;
  expression: string;
}

interface AstPlainNode extends AstNodeBase {
  kind: Exclude<FormulaToken["kind"], "block">;
}

interface AstBlockNode extends AstNodeBase {
  kind: "block";
  blockName: string;
  args: AstNode[][];
}

export type AstNode = AstPlainNode | AstBlockNode;
let astDupCounter = 0;

function isAstNode(value: unknown): value is AstNode {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AstNode>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.kind === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.expression === "string"
  );
}

function toFallbackTextToken(value: unknown, index: number): FormulaToken {
  const candidate = (value ?? {}) as Partial<AstNode>;
  const expression =
    typeof candidate.expression === "string"
      ? candidate.expression
      : typeof candidate.label === "string"
        ? candidate.label
        : "";
  const label =
    typeof candidate.label === "string" && candidate.label.trim()
      ? candidate.label
      : expression || "token";
  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : `ast_fallback_${index}`,
    kind: "text",
    label,
    expression
  };
}

function clampInsert(index: number, len: number): number {
  return Math.max(0, Math.min(index, len));
}

function nextAstId(): string {
  astDupCounter += 1;
  return `ast_dup_${astDupCounter}`;
}

function cloneAstNode(node: AstNode): AstNode {
  if (node.kind !== "block") {
    return { ...node, id: nextAstId() } as AstPlainNode;
  }
  return {
    ...node,
    id: nextAstId(),
    args: (node.args ?? []).map((arg) => (arg ?? []).map((child) => cloneAstNode(child)))
  } as AstBlockNode;
}

export function parseTokensToAst(
  tokens: FormulaToken[],
  conceptCodeById: Record<number, string>
): AstNode[] {
  return tokens.map((tk) => {
    if (tk.kind !== "block") return { ...tk } as AstPlainNode;
    const parsed = parseFunctionBlock(tk.expression);
    if (!parsed) return { ...tk } as AstPlainNode;
    const args = [...parsed.args];
    while (args.length < getFunctionBlockArity(parsed.name)) args.push("");
    return {
      id: tk.id,
      kind: "block",
      label: tk.label,
      expression: tk.expression,
      blockName: parsed.name,
      args: args.map((arg) => parseTokensToAst(tokenizeFormulaExpression(arg ?? "", { conceptCodeById }), conceptCodeById))
    } as AstBlockNode;
  });
}

function astNodeToToken(node: AstNode): FormulaToken {
  if (node.kind !== "block") {
    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      expression: node.expression
    };
  }
  if (!Array.isArray(node.args)) {
    const preservedExpr =
      typeof node.expression === "string" && node.expression.trim()
        ? node.expression.trim()
        : serializeFunctionBlock(node.blockName || node.label || "FN", ["", "", ""]);
    return {
      id: node.id,
      kind: "block",
      label: node.blockName || node.label || "FN",
      expression: preservedExpr
    };
  }
  const blockNameFromExpr =
    typeof node.expression === "string" ? parseFunctionBlock(node.expression)?.name : null;
  const safeBlockName =
    (typeof node.blockName === "string" && node.blockName.trim()) ||
    blockNameFromExpr ||
    node.label ||
    "FN";

  const argExprs = (Array.isArray(node.args) ? node.args : []).map((argNodes) =>
    (Array.isArray(argNodes) ? argNodes : [])
      .filter((n): n is AstNode => isAstNode(n))
      .map((n) => astNodeToToken(n).expression)
      .join(" ")
  );
  const expr = serializeFunctionBlock(safeBlockName, argExprs);
  return {
    id: node.id,
    kind: "block",
    label: safeBlockName,
    expression: expr
  };
}

export function astToTokens(nodes: AstNode[]): FormulaToken[] {
  return (nodes ?? []).map((node, index) =>
    isAstNode(node) ? astNodeToToken(node) : toFallbackTextToken(node, index)
  );
}

export function parseExpressionToAst(
  expression: string,
  conceptCodeById: Record<number, string>
): AstNode[] {
  const tokens = tokenizeFormulaExpression(expression, { conceptCodeById });
  return parseTokensToAst(tokens, conceptCodeById);
}

export function astToExpression(nodes: AstNode[]): string {
  return astToTokens(nodes)
    .map((t) => t.expression)
    .join(" ");
}

function findBlockByPath(nodes: AstNode[], pathKey: string): AstBlockNode | null {
  const parts = pathKey.split(":");
  const rootId = parts[0];
  const root = nodes.find((n) => n.id === rootId);
  if (!root || root.kind !== "block") return null;
  let current: AstBlockNode = root;

  for (let i = 1; i < parts.length; i += 2) {
    const argIndex = Number(parts[i]);
    const tokenIndex = Number(parts[i + 1]);
    if (Number.isNaN(argIndex) || Number.isNaN(tokenIndex)) return null;
    const arg = current.args[argIndex];
    if (!arg) return null;
    const child = arg[tokenIndex];
    if (!child || child.kind !== "block") return null;
    current = child;
  }

  return current;
}

function removeById(nodes: AstNode[], tokenId: string): AstNode | null {
  const idx = nodes.findIndex((n) => n.id === tokenId);
  if (idx < 0) return null;
  const [removed] = nodes.splice(idx, 1);
  return removed ?? null;
}

function removeNested(sourceBlock: AstBlockNode, argIndex: number, tokenIndex: number): AstNode | null {
  const arg = sourceBlock.args[argIndex];
  if (!arg || tokenIndex < 0 || tokenIndex >= arg.length) return null;
  const [removed] = arg.splice(tokenIndex, 1);
  return removed ?? null;
}

export function moveRootAstNodeToNested(
  ast: AstNode[],
  rootTokenId: string,
  targetPathKey: string,
  targetArgIndex: number,
  insertAt: number
): boolean {
  const moving = removeById(ast, rootTokenId);
  if (!moving) return false;
  const targetBlock = findBlockByPath(ast, targetPathKey);
  if (!targetBlock) return false;
  const targetArg = targetBlock.args[targetArgIndex];
  if (!targetArg) return false;
  targetArg.splice(clampInsert(insertAt, targetArg.length), 0, moving);
  return true;
}

export function duplicateRootAstNodeToNested(
  ast: AstNode[],
  rootTokenId: string,
  targetPathKey: string,
  targetArgIndex: number,
  insertAt: number
): boolean {
  const source = ast.find((n) => n.id === rootTokenId);
  if (!source) return false;
  const targetBlock = findBlockByPath(ast, targetPathKey);
  if (!targetBlock) return false;
  const targetArg = targetBlock.args[targetArgIndex];
  if (!targetArg) return false;
  targetArg.splice(clampInsert(insertAt, targetArg.length), 0, cloneAstNode(source));
  return true;
}

export function moveNestedAstNodeToRoot(
  ast: AstNode[],
  source: Extract<FormulaDragSource, { kind: "nested" }>,
  targetIndex: number
): boolean {
  const sourceBlock = findBlockByPath(ast, source.pathKey);
  if (!sourceBlock) return false;
  const moving = removeNested(sourceBlock, source.argIndex, source.tokenIndex);
  if (!moving) return false;
  ast.splice(clampInsert(targetIndex, ast.length), 0, moving);
  return true;
}

export function duplicateNestedAstNodeToRoot(
  ast: AstNode[],
  source: Extract<FormulaDragSource, { kind: "nested" }>,
  targetIndex: number
): boolean {
  const sourceBlock = findBlockByPath(ast, source.pathKey);
  if (!sourceBlock) return false;
  const sourceArg = sourceBlock.args[source.argIndex];
  if (!sourceArg || source.tokenIndex < 0 || source.tokenIndex >= sourceArg.length) return false;
  const sourceNode = sourceArg[source.tokenIndex];
  if (!sourceNode) return false;
  ast.splice(clampInsert(targetIndex, ast.length), 0, cloneAstNode(sourceNode));
  return true;
}

export function moveNestedAstNode(
  ast: AstNode[],
  source: Extract<FormulaDragSource, { kind: "nested" }>,
  targetPathKey: string,
  targetArgIndex: number,
  insertAt: number
): boolean {
  const sourceBlock = findBlockByPath(ast, source.pathKey);
  const targetBlock = findBlockByPath(ast, targetPathKey);
  if (!sourceBlock || !targetBlock) return false;
  const sourceArg = sourceBlock.args[source.argIndex];
  const targetArg = targetBlock.args[targetArgIndex];
  if (!sourceArg || !targetArg) return false;

  if (source.pathKey === targetPathKey && source.argIndex === targetArgIndex) {
    if (source.tokenIndex < 0 || source.tokenIndex >= sourceArg.length) return false;
    const [moving] = sourceArg.splice(source.tokenIndex, 1);
    if (!moving) return false;
    const adjusted = source.tokenIndex < insertAt ? insertAt - 1 : insertAt;
    sourceArg.splice(clampInsert(adjusted, sourceArg.length), 0, moving);
    return true;
  }

  if (source.tokenIndex < 0 || source.tokenIndex >= sourceArg.length) return false;
  const [moving] = sourceArg.splice(source.tokenIndex, 1);
  if (!moving) return false;
  targetArg.splice(clampInsert(insertAt, targetArg.length), 0, moving);
  return true;
}

export function duplicateNestedAstNode(
  ast: AstNode[],
  source: Extract<FormulaDragSource, { kind: "nested" }>,
  targetPathKey: string,
  targetArgIndex: number,
  insertAt: number
): boolean {
  const sourceBlock = findBlockByPath(ast, source.pathKey);
  const targetBlock = findBlockByPath(ast, targetPathKey);
  if (!sourceBlock || !targetBlock) return false;
  const sourceArg = sourceBlock.args[source.argIndex];
  const targetArg = targetBlock.args[targetArgIndex];
  if (!sourceArg || !targetArg) return false;
  if (source.tokenIndex < 0 || source.tokenIndex >= sourceArg.length) return false;
  const sourceNode = sourceArg[source.tokenIndex];
  if (!sourceNode) return false;
  targetArg.splice(clampInsert(insertAt, targetArg.length), 0, cloneAstNode(sourceNode));
  return true;
}
