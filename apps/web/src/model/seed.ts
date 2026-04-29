import { ConceptModel, FormulaTemplate, ReceiptModel } from "./types";
import { colorPalette30 } from "./constants";
import { token } from "./helpers";
import { parseTokensToAst } from "./formula-dnd";

const codeByIdSeed: Record<number, string> = {
  100: "BASICO",
  120: "ANTIGUEDAD",
  900: "BASE_REMU"
};

export const initialConcepts: ConceptModel[] = [
  {
    id: 100,
    code: "BASICO",
    name: "Sueldo Basico",
    conceptClass: "definitivo",
    conceptType: "remunerativo",
    color: colorPalette30[0],
    shape: "circle",
    tags: ["remunerativo", "basico"],
    formulaAst: parseTokensToAst([token("300000", "300000", "text")], codeByIdSeed)
  },
  {
    id: 120,
    code: "ANTIGUEDAD",
    name: "Antiguedad",
    conceptClass: "definitivo",
    conceptType: "remunerativo",
    color: colorPalette30[1],
    shape: "square",
    tags: ["remunerativo", "antiguedad"],
    formulaAst: parseTokensToAst([
      token("Sueldo Basico", "CONCEPTO(100)", "concept"),
      token("*", "*", "text"),
      token("Parametro: % antiguedad", 'PARAM("porc_antiguedad")', "param")
    ], codeByIdSeed)
  },
  {
    id: 900,
    code: "BASE_REMU",
    name: "Base Remunerativa",
    conceptClass: "transitorio",
    conceptType: "remunerativo",
    color: colorPalette30[2],
    shape: "star",
    tags: ["base"],
    formulaAst: parseTokensToAst(
      [token("Suma de conceptos remunerativos", 'SUM_TAG("remunerativo")', "function")],
      codeByIdSeed
    )
  }
];

export const initialReceipts: ReceiptModel[] = [
  {
    id: "Luz y Fuerza__Normal",
    convenio: "Luz y Fuerza",
    liquidationType: "Normal",
    definitiveOrder: [100, 120],
    transitoryOrder: [900]
  },
  {
    id: "APUAYE__Normal",
    convenio: "APUAYE",
    liquidationType: "Normal",
    definitiveOrder: [100],
    transitoryOrder: []
  }
];

export const formulaTemplates: FormulaTemplate[] = [
  { id: "sum-remu", label: "Suma de conceptos remunerativos", expression: 'SUM_TAG("remunerativo")', kind: "function" },
  { id: "param-antiguedad", label: "Parametro: % antiguedad", expression: 'PARAM("porc_antiguedad")', kind: "param" }
];
