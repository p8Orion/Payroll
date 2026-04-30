import { useCallback, useMemo } from "react";
import {
  expandBracketBlocksToExpressions,
  normalizeExcelComparators,
  normalizeExcelIf
} from "../../model/function-blocks";
import { toExpressionLiteral, toNumericOrZero } from "../../model/liquidation-eval";
import { ConceptModel, ConceptTypeId, FormulaToken, TagAggregationOp } from "../../model/types";
import { applyImplicitPlusBetweenValues } from "./receiptEditorUtils";

interface UseFormulaPillPreviewParams {
  hidePrecalculationPreview: boolean;
  concepts: ConceptModel[];
  participatingConcepts: ConceptModel[];
  cycleConceptIds: Set<number>;
  formulaErrorById: Map<number, boolean>;
  previewValueById: Map<number, unknown>;
  selectedConceptId: number;
  selectedConceptType: ConceptTypeId;
  getAnterioresByType: (
    conceptId: number,
    conceptType: ConceptTypeId,
    values: Map<number, unknown>
  ) => number;
  getValorLegajo: (concepto: string, fallbackConcepto: string) => number;
  resolveValorLegajoConceptCode: (rawArg: string, fallbackConcepto: string) => string;
  resolveMesAnteriorForSimulation: (rawArgs: string) => number;
  resolveSumaAnualForSimulation: (rawArgs: string) => number;
  getAntiguedadYears: () => number;
}

const formatPreviewAmount = (value: unknown): string =>
  typeof value === "number"
    ? `$${value.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    : String(value);

export function useFormulaPillPreview({
  hidePrecalculationPreview,
  concepts,
  participatingConcepts,
  cycleConceptIds,
  formulaErrorById,
  previewValueById,
  selectedConceptId,
  selectedConceptType,
  getAnterioresByType,
  getValorLegajo,
  resolveValorLegajoConceptCode,
  resolveMesAnteriorForSimulation,
  resolveSumaAnualForSimulation,
  getAntiguedadYears
}: UseFormulaPillPreviewParams) {
  const conceptIdByCode = useMemo(
    () => new Map(concepts.map((concept) => [concept.code, concept.id])),
    [concepts]
  );

  const resolveTokenConceptId = useCallback(
    (tk: FormulaToken): number | null => {
      if (tk.kind !== "concept") return null;
      const byId = tk.expression.match(/^CONCEPTO\((\d+)\)$/);
      if (byId) return Number(byId[1]);
      const byCode = tk.expression.match(/^CCONCEPTO\("([^"]+)"\)$/);
      if (!byCode) return null;
      return conceptIdByCode.get(byCode[1]) ?? null;
    },
    [conceptIdByCode]
  );

  const tokenDependsOnCycle = useCallback(
    (expression: string): boolean => {
      for (const match of expression.matchAll(/CONCEPTO\((\d+)\)/g)) {
        if (cycleConceptIds.has(Number(match[1]))) return true;
      }
      for (const match of expression.matchAll(/CCONCEPTO\("([^"]+)"\)/g)) {
        const depId = participatingConcepts.find((c) => c.code === match[1])?.id;
        if (depId && cycleConceptIds.has(depId)) return true;
      }
      for (const match of expression.matchAll(/SUM_TAG\("([^"]+)"\)/g)) {
        const hasCycleInTag = participatingConcepts.some(
          (c) => c.tags.includes(match[1]) && cycleConceptIds.has(c.id)
        );
        if (hasCycleInTag) return true;
      }
      for (const match of expression.matchAll(/TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g)) {
        const hasCycleInTag = participatingConcepts.some(
          (c) => c.tags.includes(match[2]) && cycleConceptIds.has(c.id)
        );
        if (hasCycleInTag) return true;
      }
      return false;
    },
    [cycleConceptIds, participatingConcepts]
  );

  const tokenDependsOnFormulaError = useCallback(
    (expression: string): boolean => {
      for (const match of expression.matchAll(/CONCEPTO\((\d+)\)/g)) {
        if (formulaErrorById.get(Number(match[1]))) return true;
      }
      for (const match of expression.matchAll(/CCONCEPTO\("([^"]+)"\)/g)) {
        const depId = participatingConcepts.find((c) => c.code === match[1])?.id;
        if (depId && formulaErrorById.get(depId)) return true;
      }
      for (const match of expression.matchAll(/SUM_TAG\("([^"]+)"\)/g)) {
        const hasErrorInTag = participatingConcepts.some(
          (c) => c.tags.includes(match[1]) && formulaErrorById.get(c.id)
        );
        if (hasErrorInTag) return true;
      }
      for (const match of expression.matchAll(/TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g)) {
        const hasErrorInTag = participatingConcepts.some(
          (c) => c.tags.includes(match[2]) && formulaErrorById.get(c.id)
        );
        if (hasErrorInTag) return true;
      }
      return false;
    },
    [formulaErrorById, participatingConcepts]
  );

  const evaluateTokenPreviewValue = useCallback(
    (expression: string): unknown => {
      const params: Record<string, number> = { porc_antiguedad: 0.12 };
      const normalized = expandBracketBlocksToExpressions(expression)
        .replace(/VALOR_FIJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
          const code = resolveValorLegajoConceptCode(rawArg, "");
          return String(getValorLegajo(code, ""));
        })
        .replace(/VALOR_LEGAJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
          const code = resolveValorLegajoConceptCode(rawArg, "");
          return String(getValorLegajo(code, ""));
        })
        .replace(/MES_ANTERIOR_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArgs: string) =>
          String(resolveMesAnteriorForSimulation(rawArgs))
        )
        .replace(/SUMA_ANUAL_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArgs: string) =>
          String(resolveSumaAnualForSimulation(rawArgs))
        )
        .replace(/VALOR_FIJO\("([^"]*)"\)/g, (_, concepto: string) => String(getValorLegajo(concepto, "")))
        .replace(/VALOR_LEGAJO\("([^"]*)"\)/g, (_, concepto: string) => String(getValorLegajo(concepto, "")))
        .replace(/CONCEPTO\((\d+)\)/g, (_, refId: string) =>
          toExpressionLiteral(previewValueById.get(Number(refId)) ?? 0)
        )
        .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, refCode: string) => {
          const refId = participatingConcepts.find((c) => c.code === refCode)?.id;
          return toExpressionLiteral(refId ? (previewValueById.get(refId) ?? 0) : 0);
        })
        .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
          const sum = participatingConcepts
            .filter((c) => c.tags.includes(tag))
            .reduce((acc, c) => acc + toNumericOrZero(previewValueById.get(c.id)), 0);
          return String(sum);
        })
        .replace(/PARAM\("([^"]+)"\)/g, (_, param: string) => {
          const value = params[param];
          if (value === undefined) throw new Error("missing PARAM");
          return String(value);
        })
        .replace(/ANTERIORES\(\)/g, () =>
          String(getAnterioresByType(selectedConceptId, selectedConceptType, previewValueById))
        )
        .replace(/ANTIGUEDAD\(\)/g, () => String(getAntiguedadYears()))
        .replace(/TAG_OP\("([^"]+)","([^"]+)"\)/g, (_, op: TagAggregationOp, tag: string) => {
          const tagged = participatingConcepts
            .filter((c) => c.tags.includes(tag))
            .map((c) => toNumericOrZero(previewValueById.get(c.id)));
          if (!tagged.length) return "0";
          if (op === "avg") return String(tagged.reduce((a, b) => a + b, 0) / tagged.length);
          if (op === "max") return String(Math.max(...tagged));
          if (op === "min") return String(Math.min(...tagged));
          return String(tagged.reduce((a, b) => a + b, 0));
        })
        .replace(/CONSTANTE\("((?:[^"\\]|\\.)*)"\)/g, (_, raw: string) => {
          const value = raw.replace(/\\"/g, "\"");
          const normalizedNumber = value.trim().replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
          const asNumber = Number(normalizedNumber);
          if (!Number.isNaN(asNumber) && normalizedNumber !== "") return String(asNumber);
          return JSON.stringify(value);
        })
        .replace(/MATH\("((?:[^"\\]|\\.)*)"\)/g, (_, raw: string) => raw.replace(/\\"/g, "\""))
        .replace(/%\s*(-?\d+(?:\.\d+)?)/g, "* ($1) / 100")
        .replace(/(-?\d+(?:\.\d+)?)\s*%/g, "($1 / 100)")
        .replace(/\[/g, "(")
        .replace(/\]/g, ")");
      const excelLike = normalizeExcelComparators(normalizeExcelIf(applyImplicitPlusBetweenValues(normalized)));
      return Function(`"use strict"; const IF = (cond, v, f) => (cond ? v : f); return (${excelLike});`)();
    },
    [
      resolveValorLegajoConceptCode,
      getValorLegajo,
      resolveMesAnteriorForSimulation,
      resolveSumaAnualForSimulation,
      previewValueById,
      participatingConcepts,
      getAnterioresByType,
      selectedConceptId,
      selectedConceptType,
      getAntiguedadYears
    ]
  );

  const cacheByExpression = useMemo(() => new Map<string, string | null>(), [
    hidePrecalculationPreview,
    cycleConceptIds,
    formulaErrorById,
    previewValueById,
    tokenDependsOnCycle,
    tokenDependsOnFormulaError,
    evaluateTokenPreviewValue,
    resolveTokenConceptId
  ]);

  const getFormulaPillTitle = useCallback(
    (tk: FormulaToken): string | null => {
      if (hidePrecalculationPreview) return null;
      if (tk.expression === 'MATH("+")') return null;
      const fromCache = cacheByExpression.get(tk.expression);
      if (fromCache !== undefined) return fromCache;

      const conceptId = resolveTokenConceptId(tk);
      let resolved: string | null;
      if (conceptId) {
        if (cycleConceptIds.has(conceptId)) resolved = "Pre-cálculo: error (ciclo DAG)";
        else if (formulaErrorById.get(conceptId)) resolved = "Pre-cálculo: error de compilacion";
        else resolved = `Pre-cálculo: ${formatPreviewAmount(previewValueById.get(conceptId) ?? 0)}`;
      } else if (tokenDependsOnCycle(tk.expression)) {
        resolved = "Pre-cálculo: error (ciclo DAG)";
      } else if (tokenDependsOnFormulaError(tk.expression)) {
        resolved = "Pre-cálculo: error de compilacion";
      } else {
        try {
          resolved = `Pre-cálculo: ${formatPreviewAmount(evaluateTokenPreviewValue(tk.expression))}`;
        } catch {
          resolved = "Pre-cálculo: error de compilacion";
        }
      }

      cacheByExpression.set(tk.expression, resolved);
      return resolved;
    },
    [
      hidePrecalculationPreview,
      cacheByExpression,
      resolveTokenConceptId,
      cycleConceptIds,
      formulaErrorById,
      previewValueById,
      tokenDependsOnCycle,
      tokenDependsOnFormulaError,
      evaluateTokenPreviewValue
    ]
  );

  return {
    resolveTokenConceptId,
    getFormulaPillTitle
  };
}
