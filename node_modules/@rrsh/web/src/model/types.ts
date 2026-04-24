export type ConceptClass = "definitivo" | "transitorio";
export type ConceptShape =
  | "circle"
  | "square"
  | "star"
  | "triangle"
  | "diamond"
  | "plus"
  | "hex";
export type TagAggregationOp = "sum" | "avg" | "max" | "min";
export const LIQUIDATION_TYPES = [
  "Normal",
  "Vacaciones",
  "BAE",
  "SAC",
  "Final",
  "Anual",
  "Ticket"
] as const;
export type LiquidationType = (typeof LIQUIDATION_TYPES)[number];

export interface FormulaToken {
  id: string;
  kind: "concept" | "function" | "param" | "text" | "slot" | "block";
  label: string;
  expression: string;
}

export interface FormulaAstNodeBase {
  id: string;
  kind: FormulaToken["kind"];
  label: string;
  expression: string;
}

export interface FormulaAstPlainNode extends FormulaAstNodeBase {
  kind: Exclude<FormulaToken["kind"], "block">;
}

export interface FormulaAstBlockNode extends FormulaAstNodeBase {
  kind: "block";
  blockName: string;
  args: FormulaAstNode[][];
}

export type FormulaAstNode = FormulaAstPlainNode | FormulaAstBlockNode;

export interface ConceptModel {
  id: number;
  code: string;
  name: string;
  conceptClass: ConceptClass;
  color: string;
  shape: ConceptShape;
  tags: string[];
  formulaAst: FormulaAstNode[];
}

export interface ReceiptModel {
  id: string;
  convenio: string;
  liquidationType: LiquidationType;
  definitiveOrder: number[];
  transitoryOrder: number[];
}

export interface FormulaTemplate {
  id: string;
  label: string;
  expression: string;
  kind: "function" | "param";
}
