import { ConceptModel, FormulaTemplate, ReceiptModel } from "./types";
import { colorPalette30 } from "./constants";
import { token } from "./helpers";

export const initialConcepts: ConceptModel[] = [
  {
    id: 100,
    code: "BASICO",
    name: "Sueldo Basico",
    conceptClass: "definitivo",
    color: colorPalette30[0],
    shape: "circle",
    tags: ["remunerativo", "basico"],
    formulaTokens: [token("300000", "300000", "number")]
  },
  {
    id: 120,
    code: "ANTIGUEDAD",
    name: "Antiguedad",
    conceptClass: "definitivo",
    color: colorPalette30[1],
    shape: "square",
    tags: ["remunerativo", "antiguedad"],
    formulaTokens: [
      token("Sueldo Basico", "CONCEPTO(100)", "concept"),
      token("*", "*", "text"),
      token("Parametro: % antiguedad", 'PARAM("porc_antiguedad")', "param")
    ]
  },
  {
    id: 900,
    code: "BASE_REMU",
    name: "Base Remunerativa",
    conceptClass: "transitorio",
    color: colorPalette30[2],
    shape: "star",
    tags: ["base"],
    formulaTokens: [token("Suma de conceptos remunerativos", 'SUM_TAG("remunerativo")', "function")]
  }
];

export const initialReceipts: ReceiptModel[] = [
  { id: "recibo_1", name: "Recibo mensual", convenio: "Luz y Fuerza", definitiveOrder: [100, 120] },
  { id: "recibo_2", name: "Recibo mensual", convenio: "APUAYE", definitiveOrder: [100] }
];

export const formulaTemplates: FormulaTemplate[] = [
  { id: "sum-remu", label: "Suma de conceptos remunerativos", expression: 'SUM_TAG("remunerativo")', kind: "function" },
  { id: "param-antiguedad", label: "Parametro: % antiguedad", expression: 'PARAM("porc_antiguedad")', kind: "param" }
];
