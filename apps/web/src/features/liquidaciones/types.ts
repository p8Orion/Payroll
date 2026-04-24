import { LiquidationType } from "../../model/types";

export interface LiquidacionConceptoRow {
  conceptId: number;
  conceptCode: string;
  conceptName: string;
  conceptClass?: "definitivo" | "transitorio";
  value: unknown;
  formulaUsed: string;
}

export interface LiquidacionLegajoRow {
  legajoId: string;
  legajoNro: string;
  legajoNombre: string;
  convenio: string;
  conceptos: LiquidacionConceptoRow[];
  total: number;
}

export interface LiquidacionRecord {
  id: string;
  liquidationType: LiquidationType;
  month: number;
  year: number;
  createdAt: string;
  legajos: LiquidacionLegajoRow[];
}
