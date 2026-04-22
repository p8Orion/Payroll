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

export interface FormulaToken {
  id: string;
  kind: "concept" | "function" | "param" | "text" | "slot";
  label: string;
  expression: string;
}

export interface ConceptModel {
  id: number;
  code: string;
  name: string;
  conceptClass: ConceptClass;
  color: string;
  shape: ConceptShape;
  tags: string[];
  formulaTokens: FormulaToken[];
}

export interface ReceiptModel {
  id: string;
  name: string;
  convenio: string;
  definitiveOrder: number[];
}

export interface FormulaTemplate {
  id: string;
  label: string;
  expression: string;
  kind: "function" | "param";
}
