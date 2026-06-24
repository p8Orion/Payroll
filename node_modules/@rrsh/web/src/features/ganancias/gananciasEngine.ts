import { ConceptModel } from "../../model/types";
import { GananciasTableModel } from "../../model/types";

function toNumericOrZero(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface GananciasTraceStep {
  conceptId: number;
  conceptCode: string;
  conceptName: string;
  f1359FieldId: string;
  registro: string;
  value: number;
}

export interface GananciasTrace {
  steps: GananciasTraceStep[];
  byRegistro: Array<{ registro: string; total: number }>;
  totalRetenido: number;
  grouped: {
    remuneracionGravadaItems: Array<{ conceptId: number; conceptCode: string; conceptName: string; value: number }>;
    deduccionesConceptosItems: Array<{ conceptId: number; conceptCode: string; conceptName: string; value: number }>;
    deduccionesTablaItems: Array<{ label: string; value: number }>;
    remuneracionGravada: number;
    deduccionesConceptos: number;
    remuneracionGravadaLiquidacionesPrevias: number;
    remuneracionGravadaMesActual: number;
    deduccionesConceptosLiquidacionesPrevias: number;
    deduccionesConceptosMesActual: number;
    deduccionesTabla: number;
    deduccionesF572: number;
    baseImponible: number;
    impuestoDeterminadoAcumulado: number;
    retencionesPrevias: number;
    aRetenerEnMes: number;
    escalaAplicada: {
      fromAmount: number;
      toAmount: number | null;
      fixedTax: number;
      percentRate: number;
      excessOver: number;
      excedente: number;
      impuestoPorExcedente: number;
      source: "tabla_mes";
    };
  };
}

export function computeGananciasTrace(concepts: ConceptModel[], values: Map<number, unknown>): GananciasTrace {
  const steps = concepts
    .filter((concept) => Boolean(concept.f1359FieldId?.trim()))
    .map((concept) => {
      const fieldId = concept.f1359FieldId?.trim() ?? "";
      const registro = fieldId.match(/^REG(\d+)_/)?.[1] ?? "00";
      return {
        conceptId: concept.id,
        conceptCode: concept.code,
        conceptName: concept.name,
        f1359FieldId: fieldId,
        registro,
        value: toNumericOrZero(values.get(concept.id))
      };
    });

  const registroMap = new Map<string, number>();
  for (const step of steps) {
    registroMap.set(step.registro, (registroMap.get(step.registro) ?? 0) + step.value);
  }

  const byRegistro = Array.from(registroMap.entries())
    .map(([registro, total]) => ({ registro, total }))
    .sort((a, b) => a.registro.localeCompare(b.registro));
  const totalRetenido = steps.reduce((acc, step) => acc + step.value, 0);

  return {
    steps,
    byRegistro,
    totalRetenido,
    grouped: {
      deduccionesTablaItems: [],
      remuneracionGravada: 0,
      deduccionesConceptos: 0,
      remuneracionGravadaLiquidacionesPrevias: 0,
      remuneracionGravadaMesActual: 0,
      deduccionesConceptosLiquidacionesPrevias: 0,
      deduccionesConceptosMesActual: 0,
      remuneracionGravadaItems: [],
      deduccionesConceptosItems: [],
      deduccionesTabla: 0,
      deduccionesF572: 0,
      baseImponible: 0,
      impuestoDeterminadoAcumulado: 0,
      retencionesPrevias: 0,
      aRetenerEnMes: totalRetenido,
      escalaAplicada: {
        fromAmount: 0,
        toAmount: null,
        fixedTax: 0,
        percentRate: 0,
        excessOver: 0,
        excedente: 0,
        impuestoPorExcedente: 0,
        source: "tabla_mes"
      }
    }
  };
}

export function computeGananciasValue(concepts: ConceptModel[], values: Map<number, unknown>, currentConceptId?: number): number {
  let total = 0;
  for (const concept of concepts) {
    if (currentConceptId !== undefined && concept.id === currentConceptId) continue;
    if (!concept.f1359FieldId?.trim()) continue;
    total += toNumericOrZero(values.get(concept.id));
  }
  return total;
}

interface HistoryRecordLike {
  liquidationType: string;
  estado?: "Generada" | "Anulada";
  month: number;
  year: number;
  createdAt?: string;
  legajos: Array<{
    legajoId: string;
    conceptos: Array<{ conceptId?: number; conceptCode?: string; value: unknown }>;
  }>;
}

interface ComputeGananciasFromHistoryParams {
  allConcepts: ConceptModel[];
  currentValues: Map<number, unknown>;
  currentReceiptConceptIds: number[];
  currentLiquidationType: string;
  asOfMonth: number;
  asOfYear: number;
  legajoId: string;
  liquidacionesHistory: HistoryRecordLike[];
  gananciasTables: GananciasTableModel[];
}

function taxFromScale(baseImponible: number, escala: Array<{
  fromAmount: number;
  toAmount: number | null;
  fixedTax: number;
  percentRate: number;
  excessOver: number;
}>): {
  impuestoDeterminadoAcumulado: number;
  row: {
    fromAmount: number;
    toAmount: number | null;
    fixedTax: number;
    percentRate: number;
    excessOver: number;
  } | null;
  excedente: number;
  impuestoPorExcedente: number;
} {
  const row =
    escala.find((item) => baseImponible > item.fromAmount && (item.toAmount === null || baseImponible <= item.toAmount)) ??
    escala[0];
  if (!row) {
    return {
      impuestoDeterminadoAcumulado: 0,
      row: null,
      excedente: 0,
      impuestoPorExcedente: 0
    };
  }
  const excedente = Math.max(0, baseImponible - row.excessOver);
  const impuestoPorExcedente = excedente * (row.percentRate / 100);
  return {
    impuestoDeterminadoAcumulado: row.fixedTax + impuestoPorExcedente,
    row,
    excedente,
    impuestoPorExcedente
  };
}

export function computeGananciasFromHistory({
  allConcepts,
  currentValues,
  currentReceiptConceptIds,
  currentLiquidationType,
  asOfMonth,
  asOfYear,
  legajoId,
  liquidacionesHistory,
  gananciasTables
}: ComputeGananciasFromHistoryParams): GananciasTrace {
  const conceptById = new Map(allConcepts.map((c) => [c.id, c]));
  const conceptByCode = new Map(allConcepts.map((c) => [c.code, c]));
  const latestByMonthType = new Map<string, HistoryRecordLike>();

  for (const liq of liquidacionesHistory) {
    if (liq.estado === "Anulada") continue;
    if (liq.year !== asOfYear) continue;
    if (liq.month > asOfMonth) continue;
    const key = `${liq.year}-${liq.month}-${liq.liquidationType}`;
    const prev = latestByMonthType.get(key);
    if (!prev || (liq.createdAt ?? "") > (prev.createdAt ?? "")) latestByMonthType.set(key, liq);
  }

  const currentSnapshotConcepts = currentReceiptConceptIds.map((conceptId) => {
    const concept = conceptById.get(conceptId);
    return {
      conceptId,
      conceptCode: concept?.code,
      value: currentValues.get(conceptId) ?? 0
    };
  });
  latestByMonthType.set(`${asOfYear}-${asOfMonth}-${currentLiquidationType}`, {
    liquidationType: currentLiquidationType,
    year: asOfYear,
    month: asOfMonth,
    legajos: [{ legajoId, conceptos: currentSnapshotConcepts }]
  });

  const annualRows: Array<{
    month: number;
    fieldId: string;
    concept: ConceptModel;
    value: number;
  }> = [];

  for (const liq of latestByMonthType.values()) {
    const legajoRow = liq.legajos.find((item) => item.legajoId === legajoId);
    if (!legajoRow) continue;
    for (const row of legajoRow.conceptos) {
      const concept =
        (row.conceptId !== undefined ? conceptById.get(row.conceptId) : undefined) ??
        (row.conceptCode ? conceptByCode.get(row.conceptCode) : undefined);
      if (!concept?.f1359FieldId?.trim()) continue;
      annualRows.push({
        month: liq.month,
        fieldId: concept.f1359FieldId.trim(),
        concept,
        value: toNumericOrZero(row.value)
      });
    }
  }

  let remuneracionGravada = 0;
  let deduccionesConceptos = 0;
  let remuneracionGravadaLiquidacionesPrevias = 0;
  let remuneracionGravadaMesActual = 0;
  let deduccionesConceptosLiquidacionesPrevias = 0;
  let deduccionesConceptosMesActual = 0;
  let retencionesPrevias = 0;
  const remuneracionGravadaItems: Array<{ conceptId: number; conceptCode: string; conceptName: string; value: number }> = [];
  const deduccionesConceptosItems: Array<{ conceptId: number; conceptCode: string; conceptName: string; value: number }> = [];

  for (const row of annualRows) {
    const isCurrentMonth = row.month === asOfMonth;
    if (row.fieldId === "REG08_CAMPO06" && row.month < asOfMonth) {
      retencionesPrevias += row.value;
      continue;
    }
    if (row.concept.conceptType === "descuentos") {
      const value = Math.abs(row.value);
      deduccionesConceptos += value;
      if (isCurrentMonth) deduccionesConceptosMesActual += value;
      else deduccionesConceptosLiquidacionesPrevias += value;
      deduccionesConceptosItems.push({
        conceptId: row.concept.id,
        conceptCode: row.concept.code,
        conceptName: row.concept.name,
        value
      });
      continue;
    }
    if (row.concept.conceptType === "remunerativo" || row.concept.conceptType === "no_remunerativo") {
      remuneracionGravada += row.value;
      if (isCurrentMonth) remuneracionGravadaMesActual += row.value;
      else remuneracionGravadaLiquidacionesPrevias += row.value;
      remuneracionGravadaItems.push({
        conceptId: row.concept.id,
        conceptCode: row.concept.code,
        conceptName: row.concept.name,
        value: row.value
      });
    }
  }

  const tablaMes = gananciasTables.find((item) => item.year === asOfYear && item.month === asOfMonth);
  if (!tablaMes) {
    throw new Error(`No hay tabla de Ganancias cargada para ${asOfYear}-${String(asOfMonth).padStart(2, "0")}`);
  }
  if (!Array.isArray(tablaMes.escala) || tablaMes.escala.length === 0) {
    throw new Error(`La tabla de Ganancias ${asOfYear}-${String(asOfMonth).padStart(2, "0")} no tiene escala`);
  }
  const deduccionesMes = tablaMes.deducciones;
  const deduccionesTabla = (deduccionesMes.gananciaNoImponible ?? 0) + (deduccionesMes.deduccionEspecialIncisoD ?? 0);
  const deduccionesTablaItems = [
    { label: "Ganancia no imponible", value: deduccionesMes.gananciaNoImponible ?? 0 },
    { label: "Deducción especial inciso d", value: deduccionesMes.deduccionEspecialIncisoD ?? 0 }
  ];
  const deduccionesF572 = 0;
  const baseImponible = Math.max(0, remuneracionGravada - deduccionesConceptos - deduccionesTabla - deduccionesF572);
  const escalaSource: "tabla_mes" = "tabla_mes";
  const escala = tablaMes.escala;
  const taxBreakdown = taxFromScale(baseImponible, escala);
  const impuestoDeterminadoAcumulado = taxBreakdown.impuestoDeterminadoAcumulado;
  const aRetenerEnMes = impuestoDeterminadoAcumulado - retencionesPrevias;

  const valuesByConcept = new Map<number, number>();
  for (const row of annualRows) {
    valuesByConcept.set(row.concept.id, (valuesByConcept.get(row.concept.id) ?? 0) + row.value);
  }
  const trace = computeGananciasTrace(
    allConcepts,
    new Map<number, unknown>(Array.from(valuesByConcept.entries()).map(([k, v]) => [k, v]))
  );
  return {
    ...trace,
    totalRetenido: aRetenerEnMes,
    grouped: {
      remuneracionGravada,
      deduccionesConceptos,
      remuneracionGravadaLiquidacionesPrevias,
      remuneracionGravadaMesActual,
      deduccionesConceptosLiquidacionesPrevias,
      deduccionesConceptosMesActual,
      remuneracionGravadaItems,
      deduccionesConceptosItems,
      deduccionesTablaItems,
      deduccionesTabla,
      deduccionesF572,
      baseImponible,
      impuestoDeterminadoAcumulado,
      retencionesPrevias,
      aRetenerEnMes,
      escalaAplicada: {
        fromAmount: taxBreakdown.row?.fromAmount ?? 0,
        toAmount: taxBreakdown.row?.toAmount ?? null,
        fixedTax: taxBreakdown.row?.fixedTax ?? 0,
        percentRate: taxBreakdown.row?.percentRate ?? 0,
        excessOver: taxBreakdown.row?.excessOver ?? 0,
        excedente: taxBreakdown.excedente,
        impuestoPorExcedente: taxBreakdown.impuestoPorExcedente,
        source: escalaSource
      }
    }
  };
}
