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
export type ConceptTypeId =
  | "remunerativo"
  | "no_remunerativo"
  | "descuentos"
  | "aportes_patronales";

export interface ConceptTypeDefinition {
  id: ConceptTypeId;
  label: string;
  column: number;
  sign: 1 | -1;
}

export const CONCEPT_TYPE_DEFINITIONS: ConceptTypeDefinition[] = [
  { id: "remunerativo", label: "Remunerativo", column: 1, sign: 1 },
  { id: "no_remunerativo", label: "No remunerativo", column: 2, sign: 1 },
  { id: "descuentos", label: "Descuentos", column: 3, sign: -1 },
  { id: "aportes_patronales", label: "Aportes patronales", column: 4, sign: 1 }
];

export function getConceptTypeDefinition(typeId?: ConceptTypeId): ConceptTypeDefinition {
  return CONCEPT_TYPE_DEFINITIONS.find((definition) => definition.id === typeId) ?? CONCEPT_TYPE_DEFINITIONS[0];
}
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
  conceptType: ConceptTypeId;
  f1359FieldId?: string;
  color: string;
  shape: ConceptShape;
  tags: string[];
  formulaAst: FormulaAstNode[];
}

export interface F1359FieldModel {
  id: string;
  registro: string;
  campo: string;
  descripcion: string;
  posicionInicial: number;
  posicionFinal: number;
  longitud: number;
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
