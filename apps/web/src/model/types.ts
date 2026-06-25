export type ConceptClass = "definitivo" | "transitorio";
export type ConceptShape =
  | "circle"
  | "square"
  | "star"
  | "triangle"
  | "diamond"
  | "plus"
  | "moon"
  | "clover"
  | "xmark"
  | "spark"
  | "exclamation"
  | "question"
  | "bolt"
  | "hex"
  | "rocket"
  | "moneyBag"
  | "chart"
  | "briefcase"
  | "receipt"
  | "calculator"
  | "calendar"
  | "clipboard"
  | "book"
  | "lock"
  | "key"
  | "gear"
  | "wrench"
  | "hammer"
  | "magnet"
  | "link"
  | "pin"
  | "bell"
  | "trophy"
  | "medal"
  | "gem"
  | "crown"
  | "fire"
  | "snowflake"
  | "sun"
  | "cloud"
  | "umbrella"
  | "leaf"
  | "tree"
  | "flower"
  | "apple"
  | "coffee"
  | "house"
  | "car"
  | "train"
  | "plane"
  | "ship"
  | "hourglass"
  | "scale"
  | "target"
  | "palmTree"
  | "children"
  | "baby"
  | "couple"
  | "family"
  | "health"
  | "hospital"
  | "stethoscope"
  | "pill"
  | "syringe"
  | "wheelchair"
  | "shield"
  | "coffin"
  | "handshake"
  | "school"
  | "graduation"
  | "shirt"
  | "oilDrum"
  | "actorMasks"
  | "courthouse"
  | "antarctica"
  | "broom"
  | "idCard"
  | "bank"
  | "worker"
  | "gasBottle"
  | "warning"
  | "biohazard"
  | "radioactive"
  | "olderAdult"
  | "grandfather"
  | "coins"
  | "nestEgg";
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
  conceptType?: ConceptTypeId;
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

export interface GananciasScaleRow {
  fromAmount: number;
  toAmount: number | null;
  fixedTax: number;
  percentRate: number;
  excessOver: number;
}

export interface GananciasDeducciones {
  gananciaNoImponible: number;
  conyuge: number;
  hijo: number;
  hijoIncapacitado: number;
  deduccionEspecialGeneral: number;
  deduccionEspecialNuevos: number;
  deduccionEspecialIncisoD: number;
}

export interface GananciasTableModel {
  year: number;
  month: number;
  sourcePeriod: string;
  sourceUrlArt30: string;
  sourceUrlArt94: string;
  publishedAt: string;
  deducciones: GananciasDeducciones;
  escala: GananciasScaleRow[];
}
