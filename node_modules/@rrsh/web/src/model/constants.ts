import { ConceptShape } from "./types";

export const colorPalette30 = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#DC2626", "#EA580C", "#CA8A04",
  "#65A30D", "#16A34A", "#0D9488", "#0284C7", "#2563EB", "#4F46E5", "#7C3AED", "#9333EA", "#C026D3", "#BE123C"
];

export const shapeCycle: ConceptShape[] = [
  "circle",
  "square",
  "star",
  "triangle",
  "diamond",
  "plus",
  "hex"
];

export const exampleValues = {
  params: {
    porc_antiguedad: 0.12
  },
  conceptById: {
    100: 300000,
    120: 36000
  },
  conceptByCode: {
    BASE_REMU: 336000
  },
  tagSums: {
    remunerativo: 336000
  }
};
