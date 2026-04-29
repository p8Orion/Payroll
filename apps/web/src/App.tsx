import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { colorPalette30, shapeCycle } from "./model/constants";
import {
  formulaToExpression,
  getShapeGlyph,
  token
} from "./model/helpers";
import {
  expandBracketBlocksToExpressions,
  normalizeExcelComparators,
  normalizeExcelIf,
  type FunctionBlockModel
} from "./model/function-blocks";
import {
  astToTokens,
  parseExpressionToAst
} from "./model/formula-dnd";
import { useFormulaDragSource } from "./hooks/useFormulaDragSource";
import {
  buildConstExpression
} from "./model/formula-ui";
import { useFormulaEditor } from "./features/formula-editor/useFormulaEditor";
import { FormulaEditorSection } from "./features/formula-editor/FormulaEditorSection";
import { FormulaToolsPanel } from "./features/formula-editor/FormulaToolsPanel";
import { LegajoModel, LegajosPage } from "./features/legajos/LegajosPage";
import { LiquidacionesPage } from "./features/liquidaciones/LiquidacionesPage";
import {
  ComposicionSalarialModel,
  ComposicionesSalarialesPage
} from "./features/composiciones/ComposicionesSalarialesPage";
import { initialConcepts, initialReceipts } from "./model/seed";
import {
  CONCEPT_TYPE_DEFINITIONS,
  F1359FieldModel,
  ConceptShape,
  ConceptModel,
  ConceptTypeId,
  FormulaToken,
  LIQUIDATION_TYPES,
  LiquidationType,
  getConceptTypeDefinition,
  ReceiptModel,
  TagAggregationOp
} from "./model/types";

interface ApiConcept {
  id: number;
  code: string;
  name: string;
  conceptClass: "definitivo" | "transitorio";
  conceptType?: ConceptTypeId;
  f1359FieldId?: string;
  formula?: string;
  tags: string[];
}

interface ApiReceipt {
  id: string;
  convenio: string;
  liquidationType: string;
  definitiveOrder: number[];
  transitoryOrder: number[];
}

interface ApiF1359Field {
  id: string;
  registro: string;
  campo: string;
  descripcion: string;
  posicionInicial: number;
  posicionFinal: number;
  longitud: number;
}

interface HistoricalLiquidacionRecord {
  liquidationType: LiquidationType;
  estado?: "Generada" | "Anulada";
  month: number;
  year: number;
  createdAt?: string;
  legajos: Array<{
    legajoId: string;
    conceptos: Array<{ conceptId?: number; conceptCode?: string; value: unknown }>;
  }>;
}

const apiBaseUrl = "http://localhost:3001";
const legacyReceiptsStorageKey = "rrsh.receipts.v1";
const receiptF1359FilterStorageKey = "rrsh.receipt-f1359-filter.v1";
const receiptTagFilterStorageKey = "rrsh.receipt-tag-filter.v1";
const maxHistoryEntries = 200;
const defaultConvenios = ["Luz y Fuerza", "Apuaye", "Comercio"];
const genericDefaultConvenio = "(Por defecto)";
const filterAllOption = "(Todos)";
const simulationMonthOptions = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" }
] as const;
const implicitTypeTagValues = new Set<string>([
  "remunerativo",
  "no_remunerativo",
  "descuentos",
  "aportes_patronales",
  "no-remunerativo",
  "aportes-patronales"
]);

const implicitTagForType = (type: ConceptTypeId): string => {
  if (type === "no_remunerativo") return "no-remunerativo";
  if (type === "aportes_patronales") return "aportes-patronales";
  return type;
};

const normalizeTagsWithImplicitType = (tags: string[], type: ConceptTypeId): string[] => {
  const explicit = tags.filter((tag) => !implicitTypeTagValues.has(tag as ConceptTypeId));
  return [...new Set([...explicit, implicitTagForType(type)])];
};

interface EditorSnapshot {
  concepts: ConceptModel[];
  receipts: ReceiptModel[];
}

function receiptId(convenio: string, liquidationType: LiquidationType): string {
  return `${convenio}__${liquidationType}`;
}

function normalizeReceipt(
  receipt: {
    id?: string;
    convenio?: string;
    name?: string;
    liquidationType?: string;
    definitiveOrder?: number[];
    transitoryOrder?: number[];
  },
  fallbackOrder: number[]
): ReceiptModel | null {
  const rawConvenio = (receipt.convenio ?? "").trim();
  const convenio = rawConvenio === "(Todos)" ? genericDefaultConvenio : rawConvenio;
  if (!convenio) return null;
  const liquid = LIQUIDATION_TYPES.includes(receipt.liquidationType as LiquidationType)
    ? (receipt.liquidationType as LiquidationType)
    : "Normal";
  return {
    id: receiptId(convenio, liquid),
    convenio,
    liquidationType: liquid,
    definitiveOrder: Array.isArray(receipt.definitiveOrder) ? receipt.definitiveOrder : fallbackOrder,
    transitoryOrder: Array.isArray((receipt as { transitoryOrder?: number[] }).transitoryOrder)
      ? ((receipt as { transitoryOrder?: number[] }).transitoryOrder as number[])
      : []
  };
}

function ensureReceiptMatrix(
  receipts: ReceiptModel[],
  convenios: string[],
  fallbackOrder: number[]
): ReceiptModel[] {
  const byKey = new Map<string, ReceiptModel>();
  for (const raw of receipts) {
    const normalized = normalizeReceipt(raw, fallbackOrder);
    if (!normalized) continue;
    byKey.set(receiptId(normalized.convenio, normalized.liquidationType), normalized);
  }
  const next: ReceiptModel[] = [];
  for (const convenio of convenios) {
    for (const liquidationType of LIQUIDATION_TYPES) {
      const key = receiptId(convenio, liquidationType);
      next.push(
        byKey.get(key) ?? {
          id: key,
          convenio,
          liquidationType,
          definitiveOrder: [],
          transitoryOrder: []
        }
      );
    }
  }
  return next;
}

function parseApiReceipt(
  receipt: ApiReceipt,
  fallbackOrder: number[]
): ReceiptModel | null {
  return normalizeReceipt(
    {
      id: receipt.id,
      convenio: receipt.convenio,
      liquidationType: receipt.liquidationType,
      definitiveOrder: receipt.definitiveOrder,
      transitoryOrder: receipt.transitoryOrder
    },
    fallbackOrder
  );
}

function applyImplicitPlusBetweenValues(expression: string): string {
  return expression.replace(
    /(\)|-?\d+(?:\.\d+)?)(\s+)(?=(?:\(|-?\d+(?:\.\d+)?|IF\s*\())/g,
    "$1 + "
  );
}

function toApiConcept(concept: ConceptModel): ApiConcept {
  return {
    id: concept.id,
    code: concept.code,
    name: concept.name,
    conceptClass: concept.conceptClass,
    conceptType: concept.conceptType,
    f1359FieldId: concept.f1359FieldId,
    formula: formulaToExpression(astToTokens(concept.formulaAst ?? [])),
    tags: concept.tags
  };
}

function fromApiConcept(
  concept: ApiConcept,
  conceptCodeById: Record<number, string>
): ConceptModel {
  return {
    id: concept.id,
    code: concept.code,
    name: concept.name,
    conceptClass: concept.conceptClass,
    conceptType: concept.conceptType ?? "remunerativo",
    f1359FieldId: concept.f1359FieldId ?? "",
    color: colorPalette30[(concept.id - 1) % colorPalette30.length],
    shape: shapeCycle[(concept.id - 1) % shapeCycle.length],
    tags: concept.tags ?? [],
    formulaAst: concept.formula
      ? parseExpressionToAst(concept.formula, conceptCodeById)
      : []
  };
}

async function persistConcept(concept: ConceptModel): Promise<void> {
  await fetch(`${apiBaseUrl}/concepts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiConcept(concept))
  });
}

export function App() {
  const [menu, setMenu] = useState("conceptos");
  const [liquidacionesMenuOpen, setLiquidacionesMenuOpen] = useState(false);
  const [concepts, setConcepts] = useState<ConceptModel[]>(initialConcepts);
  const defaultReceiptOrder = useMemo(() => [] as number[], []);
  const [receipts, setReceipts] = useState<ReceiptModel[]>(() =>
    ensureReceiptMatrix(initialReceipts, defaultConvenios, [])
  );
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [activeReceiptId, setActiveReceiptId] = useState("");
  const [receiptConvenioFilter, setReceiptConvenioFilter] = useState(genericDefaultConvenio);
  const [receiptLiquidationTypeFilter, setReceiptLiquidationTypeFilter] = useState<string>("Normal");
  const [convenioOptions, setConvenioOptions] = useState<string[]>(defaultConvenios);
  const [legajos, setLegajos] = useState<LegajoModel[]>(() => {
    return [];
  });
  const [composiciones, setComposiciones] = useState<ComposicionSalarialModel[]>([]);
  const [simLegajoId, setSimLegajoId] = useState<string>("");
  const [simMonth, setSimMonth] = useState<number>(new Date().getMonth() + 1);
  const [simYear, setSimYear] = useState<number>(new Date().getFullYear());
  const [liquidacionesHistory, setLiquidacionesHistory] = useState<HistoricalLiquidacionRecord[]>([]);
  const [newTagDraft, setNewTagDraft] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [conceptCodeDraft, setConceptCodeDraft] = useState("");
  const [conceptNameDraft, setConceptNameDraft] = useState("");
  const [conceptTypeDraft, setConceptTypeDraft] = useState<ConceptTypeId>("remunerativo");
  const [membershipTypeDropdownOpen, setMembershipTypeDropdownOpen] = useState(false);
  const [membershipConvenioDropdownOpen, setMembershipConvenioDropdownOpen] = useState(false);
  const [showReceiptConceptDetail, setShowReceiptConceptDetail] = useState(false);
  const [f1359Fields, setF1359Fields] = useState<F1359FieldModel[]>([]);
  const [receiptF1359Filter, setReceiptF1359Filter] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(receiptF1359FilterStorageKey) ?? "";
  });
  const [receiptTagFilter, setReceiptTagFilter] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(receiptTagFilterStorageKey) ?? "";
  });
  const [conceptsLoaded, setConceptsLoaded] = useState(false);
  const [legajosLoaded, setLegajosLoaded] = useState(false);
  const appearanceRef = useRef<HTMLDivElement | null>(null);
  const liquidacionesMenuRef = useRef<HTMLDivElement | null>(null);
  const membershipTypeComboRef = useRef<HTMLDivElement | null>(null);
  const membershipConvenioComboRef = useRef<HTMLDivElement | null>(null);
  const [tagModal, setTagModal] = useState<{
    open: boolean;
    tag: string;
    insertAt: number;
  }>({ open: false, tag: "", insertAt: 0 });
  const [historyPast, setHistoryPast] = useState<EditorSnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<EditorSnapshot[]>([]);
  const historyLastRef = useRef<string>("");
  const historyApplyingRef = useRef(false);
  const { dragSourceRef: formulaDragSourceRef, setRootDragSource, setNestedDragSource } =
    useFormulaDragSource();

  const setCursorGhost = (event: DragEvent<HTMLElement>, label: string) => {
    const ghost = document.createElement("div");
    ghost.textContent = label;
    ghost.style.position = "fixed";
    ghost.style.top = "-9999px";
    ghost.style.left = "-9999px";
    ghost.style.pointerEvents = "none";
    ghost.style.padding = "6px 10px";
    ghost.style.borderRadius = "999px";
    ghost.style.border = "1px solid #becae8";
    ghost.style.background = "rgba(238, 243, 255, 0.28)";
    ghost.style.color = "#1f2d52";
    ghost.style.fontSize = "12px";
    ghost.style.fontWeight = "600";
    ghost.style.fontFamily = "Inter, Segoe UI, Arial, sans-serif";
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 14, 14);
    setTimeout(() => {
      ghost.remove();
    }, 0);
  };

  const createSnapshot = (): EditorSnapshot => ({
    concepts: JSON.parse(JSON.stringify(concepts)) as ConceptModel[],
    receipts: JSON.parse(JSON.stringify(receipts)) as ReceiptModel[]
  });

  const applySnapshot = (snapshot: EditorSnapshot) => {
    historyApplyingRef.current = true;
    setConcepts(snapshot.concepts);
    setReceipts(snapshot.receipts);
  };

  const undo = () => {
    if (!historyPast.length) return;
    const previous = historyPast[historyPast.length - 1];
    const current = createSnapshot();
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [current, ...prev].slice(0, maxHistoryEntries));
    applySnapshot(previous);
  };

  const redo = () => {
    if (!historyFuture.length) return;
    const next = historyFuture[0];
    const current = createSnapshot();
    setHistoryFuture((prev) => prev.slice(1));
    setHistoryPast((prev) => [...prev, current].slice(-maxHistoryEntries));
    applySnapshot(next);
  };

  const definitivos = concepts.filter((c) => c.conceptClass === "definitivo");
  const convenios = useMemo(
    () =>
      Array.from(
        new Set([
          filterAllOption,
          ...convenioOptions,
          ...receipts.map((r) => r.convenio),
          receiptConvenioFilter
        ])
      ),
    [receipts, convenioOptions, receiptConvenioFilter]
  );
  const receiptsByConvenio = useMemo(
    () =>
      receiptConvenioFilter === filterAllOption
        ? receipts
        : receipts.filter((r) => r.convenio === receiptConvenioFilter),
    [receipts, receiptConvenioFilter]
  );
  const receiptLiquidationTypeOptions = useMemo(
    () =>
      Array.from(
        new Set([filterAllOption, ...receiptsByConvenio.map((receipt) => receipt.liquidationType)])
      ),
    [receiptsByConvenio]
  );
  const receiptsByScreenFilter = useMemo(
    () =>
      receiptLiquidationTypeFilter === filterAllOption
        ? receiptsByConvenio
        : receiptsByConvenio.filter((receipt) => receipt.liquidationType === receiptLiquidationTypeFilter),
    [receiptsByConvenio, receiptLiquidationTypeFilter]
  );
  const hidePrecalculationPreview =
    receiptConvenioFilter === filterAllOption || receiptLiquidationTypeFilter === filterAllOption;
  const allTags = [...new Set(concepts.flatMap((c) => c.tags))].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );
  const fixedValueKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...legajos.flatMap((l) => (l.valoresFijos ?? []).map((vf) => (vf.clave ?? "").trim())),
          ...composiciones.flatMap((c) => (c.valoresFijos ?? []).map((vf) => (vf.clave ?? "").trim()))
        ].filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [legajos, composiciones]
  );
  const filteredTagSuggestions = allTags.filter(
    (tag) =>
      !implicitTypeTagValues.has(tag) &&
      tag.toLowerCase().includes(newTagDraft.trim().toLowerCase())
  );
  const [editingId, setEditingId] = useState<number>(definitivos[0].id);
  const activeReceipt = receipts.find((r) => r.id === activeReceiptId) ?? receiptsByScreenFilter[0] ?? receipts[0];
  const definitiveOrderForScreen = Array.from(
    new Set(receiptsByScreenFilter.flatMap((receipt) => receipt.definitiveOrder))
  );
  const transitoryOrderForScreen = Array.from(
    new Set(receiptsByScreenFilter.flatMap((receipt) => receipt.transitoryOrder))
  );
  const definitivosEnReciboBase = definitiveOrderForScreen
    .map((id) => concepts.find((c) => c.id === id))
    .filter((c): c is ConceptModel => Boolean(c));
  const transitoriosEnReciboBase = transitoryOrderForScreen
    .map((id) => concepts.find((c) => c.id === id))
    .filter((c): c is ConceptModel => Boolean(c))
    .sort((a, b) => a.code.localeCompare(b.code, "es", { sensitivity: "base" }));
  const definitivosEnRecibo = receiptF1359Filter
    ? definitivosEnReciboBase.filter((concept) => (concept.f1359FieldId ?? "") === receiptF1359Filter)
    : definitivosEnReciboBase;
  const transitoriosEnRecibo = receiptF1359Filter
    ? transitoriosEnReciboBase.filter((concept) => (concept.f1359FieldId ?? "") === receiptF1359Filter)
    : transitoriosEnReciboBase;
  const normalizedReceiptTagFilter = receiptTagFilter.trim().toLowerCase();
  const definitivosEnReciboFiltrados = normalizedReceiptTagFilter
    ? definitivosEnRecibo.filter((concept) =>
        (concept.tags ?? []).some((tag) => tag.trim().toLowerCase() === normalizedReceiptTagFilter)
      )
    : definitivosEnRecibo;
  const transitoriosEnReciboFiltrados = normalizedReceiptTagFilter
    ? transitoriosEnRecibo.filter((concept) =>
        (concept.tags ?? []).some((tag) => tag.trim().toLowerCase() === normalizedReceiptTagFilter)
      )
    : transitoriosEnRecibo;

  const selectedConcept = concepts.find((c) => c.id === editingId) ?? concepts[0];
  const conceptReceiptMembership = useMemo(
    () =>
      receipts.map((receipt) => ({
        receiptId: receipt.id,
        convenio: receipt.convenio,
        liquidationType: receipt.liquidationType,
        belongs:
          selectedConcept.conceptClass === "definitivo"
            ? receipt.definitiveOrder.includes(selectedConcept.id)
            : receipt.transitoryOrder.includes(selectedConcept.id)
      })),
    [receipts, selectedConcept]
  );
  const membershipConvenioOptions = useMemo(
    () => Array.from(new Set(conceptReceiptMembership.map((item) => item.convenio))),
    [conceptReceiptMembership]
  );
  const membershipLiquidationTypeOptions = useMemo(
    () => Array.from(new Set(conceptReceiptMembership.map((item) => item.liquidationType))),
    [conceptReceiptMembership]
  );
  const selectedConveniosForIntersection = useMemo(
    () =>
      membershipConvenioOptions.filter((convenio) =>
        conceptReceiptMembership.some((item) => item.convenio === convenio && item.belongs)
      ),
    [membershipConvenioOptions, conceptReceiptMembership]
  );
  const selectedLiquidationTypesForIntersection = useMemo(
    () =>
      membershipLiquidationTypeOptions.filter((liquidationType) =>
        conceptReceiptMembership.some(
          (item) => item.liquidationType === liquidationType && item.belongs
        )
      ),
    [membershipLiquidationTypeOptions, conceptReceiptMembership]
  );
  const selectedFormulaAst = selectedConcept.formulaAst ?? [];
  const conceptTokens = (concept: ConceptModel): FormulaToken[] => astToTokens(concept.formulaAst ?? []);
  const conceptExpression = (concept: ConceptModel): string => formulaToExpression(conceptTokens(concept));
  const selectedFormulaTokens = useMemo(
    () => conceptTokens(selectedConcept),
    [selectedConcept]
  );
  const conceptCodeById = useMemo(
    () => Object.fromEntries(concepts.map((c) => [c.id, c.code])) as Record<number, string>,
    [concepts]
  );
  const simLegajo = useMemo(
    () => legajos.find((l) => l.id === simLegajoId) ?? legajos[0] ?? null,
    [legajos, simLegajoId]
  );
  const simLegajosForConvenio = useMemo(
    () =>
      (receiptConvenioFilter ?? "").trim() === filterAllOption
        ? legajos
        : legajos.filter((l) => (l.convenio ?? "").trim() === (activeReceipt?.convenio ?? "").trim()),
    [legajos, receiptConvenioFilter, activeReceipt]
  );
  const resolveComposicionLegajo = (legajo: LegajoModel | null): ComposicionSalarialModel | undefined => {
    if (!legajo) return undefined;
    const selected = (legajo.composicionSalarial ?? "").trim();
    if (!selected) return undefined;
    const normalize = (value: string | undefined): string => (value ?? "").trim().toLowerCase();
    const byId = composiciones.find(
      (c) =>
        c.id === selected &&
        normalize(c.convenio) === normalize(legajo.convenio)
    );
    if (byId) return byId;
    return composiciones.find(
      (c) =>
        normalize(c.code) === normalize(selected) &&
        normalize(c.convenio) === normalize(legajo.convenio)
    );
  };
  const getValorLegajo = (concepto: string, fallbackConcepto: string): number => {
    if (!simLegajo) return 0;
    const requested = concepto.trim();
    const effectiveConcepto = requested.length ? requested : fallbackConcepto;
    const key = effectiveConcepto.trim().toLowerCase();
    if (!key) return 0;
    const foundLegajo = simLegajo.valoresFijos.find(
      (vf) => ((vf.clave ?? "").trim().toLowerCase() === key || ((vf as { concepto?: string }).concepto ?? "").trim().toLowerCase() === key)
    );
    if (foundLegajo) return foundLegajo.valor;
    const comp = resolveComposicionLegajo(simLegajo);
    const foundComp = comp?.valoresFijos.find(
      (vf) => ((vf.clave ?? "").trim().toLowerCase() === key || ((vf as { concepto?: string }).concepto ?? "").trim().toLowerCase() === key)
    );
    return foundComp?.valor ?? 0;
  };
  const getAntiguedadYears = (): number => {
    const rawIngreso = (simLegajo?.fechaIngreso ?? "").trim();
    if (!rawIngreso) return 0;
    const parsed = rawIngreso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parsed) return 0;
    const ingresoYear = Number(parsed[1]);
    const ingresoMonth = Number(parsed[2]);
    if (!Number.isFinite(ingresoYear) || !Number.isFinite(ingresoMonth)) return 0;
    const months = (simYear - ingresoYear) * 12 + (simMonth - ingresoMonth);
    if (!Number.isFinite(months) || months <= 0) return 0;
    return Math.floor(months / 12);
  };
  const resolveLiteralArg = (rawArg: string): string => {
    const arg = rawArg.trim();
    if (!arg) return "";
    const byConst = arg.match(/^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/);
    if (byConst) return byConst[1].replace(/\\"/g, "\"");
    const byQuoted = arg.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (byQuoted) return byQuoted[1].replace(/\\"/g, "\"");
    return arg;
  };
  const resolveMesAnteriorConceptRef = (
    rawArg: string
  ): { conceptId?: number; conceptCode?: string } => {
    const arg = rawArg.trim();
    if (!arg) return {};
    const byId = arg.match(/^CONCEPTO\((\d+)\)$/);
    if (byId) return { conceptId: Number(byId[1]) };
    const byCode = arg.match(/^CCONCEPTO\("([^"]+)"\)$/);
    if (byCode) return { conceptCode: byCode[1] };
    const value = resolveLiteralArg(arg);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && conceptCodeById[numeric]) return { conceptId: numeric };
    return { conceptCode: value };
  };
  const subtractMonths = (year: number, month: number, monthsBack: number): { year: number; month: number } => {
    const safeMonth = Math.min(12, Math.max(1, month));
    const date = new Date(Date.UTC(year, safeMonth - 1, 1));
    date.setUTCMonth(date.getUTCMonth() - monthsBack);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  };
  const resolveMesAnteriorValue = (rawArgs: string): number => {
    const [rawConcept = "", rawType = "", rawMonths = "0"] = rawArgs.split("@@");
    const conceptRef = resolveMesAnteriorConceptRef(rawConcept);
    const liquidationType = resolveLiteralArg(rawType) as LiquidationType;
    const monthsBack = Math.max(0, Math.floor(Number(resolveLiteralArg(rawMonths)) || 0));
    const target = subtractMonths(simYear, simMonth, monthsBack);
    const legajoId = (simLegajo?.id ?? "").trim();
    if (!legajoId) return 0;
    const candidates = liquidacionesHistory.filter(
      (item) =>
        item.estado !== "Anulada" &&
        item.liquidationType === liquidationType &&
        item.year === target.year &&
        item.month === target.month
    );
    if (!candidates.length) return 0;
    const sorted = [...candidates].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    for (const liq of sorted) {
      const legajoRow = liq.legajos.find((row) => row.legajoId === legajoId);
      if (!legajoRow) continue;
      const found = legajoRow.conceptos.find((row) => {
        if (conceptRef.conceptId !== undefined && row.conceptId === conceptRef.conceptId) return true;
        if (conceptRef.conceptCode && row.conceptCode === conceptRef.conceptCode) return true;
        return false;
      });
      if (found) return toNumericOrZero(found.value);
    }
    return 0;
  };
  const getAnterioresByType = (
    conceptId: number,
    conceptType: ConceptTypeId,
    values: Map<number, unknown>
  ): number => {
    const receiptOrder = [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder];
    const currentIndex = receiptOrder.indexOf(conceptId);
    if (currentIndex === -1) return 0;
    let sum = 0;
    for (let i = 0; i < currentIndex; i += 1) {
      const prevId = receiptOrder[i];
      const prevConcept = participatingConcepts.find((c) => c.id === prevId);
      if (!prevConcept || prevConcept.conceptType !== conceptType) continue;
      sum += toNumericOrZero(values.get(prevId));
    }
    return sum;
  };
  const resolveValorLegajoConceptCode = (rawArg: string, fallbackConcepto: string): string => {
    const arg = rawArg.trim();
    if (!arg) return fallbackConcepto;

    const byCode = arg.match(/^CCONCEPTO\("([^"]+)"\)$/);
    if (byCode) return byCode[1];

    const byId = arg.match(/^CONCEPTO\((\d+)\)$/);
    if (byId) return conceptCodeById[Number(byId[1])] ?? "";

    const byConst = arg.match(/^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/);
    if (byConst) return byConst[1].replace(/\\"/g, "\"");

    const byQuoted = arg.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (byQuoted) return byQuoted[1].replace(/\\"/g, "\"");

    return arg;
  };
  const toExpressionLiteral = (value: unknown): string => {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (value === null || value === undefined) return "null";
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify(String(value));
    }
  };
  const toNumericOrZero = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const applyConceptSign = (concept: ConceptModel, value: unknown): unknown => {
    if (typeof value !== "number" || !Number.isFinite(value)) return value;
    const sign = getConceptTypeDefinition(concept.conceptType).sign;
    return value * sign;
  };
  const formatPreviewAmount = (value: unknown): string =>
    typeof value === "number"
      ? `$${value.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`
      : String(value);
  const resolveTokenConceptId = (tk: FormulaToken): number | null => {
    if (tk.kind !== "concept") return null;
    const byId = tk.expression.match(/^CONCEPTO\((\d+)\)$/);
    if (byId) return Number(byId[1]);
    const byCode = tk.expression.match(/^CCONCEPTO\("([^"]+)"\)$/);
    if (byCode) {
      const concept = concepts.find((item) => item.code === byCode[1]);
      return concept?.id ?? null;
    }
    return null;
  };
  const selectConceptFromFormulaToken = (tk: FormulaToken) => {
    const targetId = resolveTokenConceptId(tk);
    if (!targetId) return;
    setEditingId(targetId);
  };
  const tokenDependsOnCycle = (expression: string): boolean => {
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
  };
  const tokenDependsOnFormulaError = (expression: string): boolean => {
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
  };
  const evaluateTokenPreviewValue = (expression: string): unknown => {
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
        String(resolveMesAnteriorValue(rawArgs))
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
        String(getAnterioresByType(selectedConcept.id, selectedConcept.conceptType, previewValueById))
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
  };
  const cacheByExpression = new Map<string, string | null>();
  const getFormulaPillTitle = (tk: FormulaToken): string | null => {
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
  };
  const {
    rootInsertSignal,
    triggerRootInsert,
    insertTokenAt,
    insertFromRawTextAt,
    insertBlockTemplateAt,
    setFormulaExpressionText,
    onTokenDropToFormula,
    renderRootFormulaToken,
    formulaExpressionText
  } = useFormulaEditor({
    selectedConcept,
    selectedFormulaTokens,
    selectedFormulaAst,
    conceptCodeById,
    concepts,
    setConcepts,
    setTagModal,
    formulaDragSourceRef,
    setRootDragSource,
    setNestedDragSource,
    setCursorGhost,
    getFormulaPillTitle,
    onSelectConceptFromToken: selectConceptFromFormulaToken
  });
  const participatingConcepts = useMemo(() => {
    const inReceipt = new Set([...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder]);
    const result = concepts.filter(
      (c) => inReceipt.has(c.id)
    );
    if (!result.some((c) => c.id === selectedConcept.id)) {
      result.push(selectedConcept);
    }
    return result;
  }, [concepts, activeReceipt, selectedConcept]);
  const previewInfo = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
    const receiptOrder = [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder];
    const receiptIndexById = new Map<number, number>(receiptOrder.map((id, index) => [id, index]));
    const incoming = new Map<number, number>();
    const outgoing = new Map<number, number[]>();
    const ids = participatingConcepts.map((c) => c.id);

    for (const id of ids) {
      incoming.set(id, 0);
      outgoing.set(id, []);
    }

    const conceptIdRefs = /CONCEPTO\((\d+)\)/g;
    const conceptCodeRefs = /CCONCEPTO\("([^"]+)"\)/g;
    const sumTagRefs = /SUM_TAG\("([^"]+)"\)/g;
    const tagOpRefs = /TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g;

    for (const concept of participatingConcepts) {
      const expression = conceptExpression(concept);
      const seenDeps = new Set<number>();
      for (const m of expression.matchAll(conceptIdRefs)) {
        const depId = Number(m[1]);
        if (!conceptById.has(depId) || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      for (const m of expression.matchAll(conceptCodeRefs)) {
        const depId = conceptIdByCode.get(m[1]);
        if (!depId || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      const tagDeps = new Set<string>();
      for (const m of expression.matchAll(sumTagRefs)) tagDeps.add(m[1]);
      for (const m of expression.matchAll(tagOpRefs)) tagDeps.add(m[2]);
      for (const tag of tagDeps) {
        for (const depConcept of participatingConcepts) {
          if (!depConcept.tags.includes(tag)) continue;
          if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
          seenDeps.add(depConcept.id);
          outgoing.get(depConcept.id)?.push(concept.id);
          incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
        }
      }
      if (/ANTERIORES\(\)/.test(expression)) {
        const currentOrder = receiptIndexById.get(concept.id);
        if (currentOrder !== undefined) {
          for (const depConcept of participatingConcepts) {
            if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
            if (depConcept.conceptType !== concept.conceptType) continue;
            const depOrder = receiptIndexById.get(depConcept.id);
            if (depOrder === undefined || depOrder >= currentOrder) continue;
            seenDeps.add(depConcept.id);
            outgoing.get(depConcept.id)?.push(concept.id);
            incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
          }
        }
      }
    }

    const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
    const topo: number[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      topo.push(current);
      for (const next of outgoing.get(current) ?? []) {
        const left = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, left);
        if (left === 0) queue.push(next);
      }
    }

    const params: Record<string, number> = { porc_antiguedad: 0.12 };
    const values = new Map<number, unknown>();

    try {
      for (const id of topo) {
        const concept = conceptById.get(id);
        if (!concept) continue;
        const expression = conceptExpression(concept);
        if (!expression.trim()) {
          values.set(id, 0);
          continue;
        }

        try {
          const normalized = expandBracketBlocksToExpressions(expression)
            .replace(/VALOR_FIJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
              const code = resolveValorLegajoConceptCode(rawArg, concept.code);
              return String(getValorLegajo(code, concept.code));
            })
            .replace(/VALOR_LEGAJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
              const code = resolveValorLegajoConceptCode(rawArg, concept.code);
              return String(getValorLegajo(code, concept.code));
            })
            .replace(/MES_ANTERIOR_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArgs: string) =>
              String(resolveMesAnteriorValue(rawArgs))
            )
            .replace(/VALOR_FIJO\("([^"]*)"\)/g, (_, concepto: string) =>
              String(getValorLegajo(concepto, concept.code))
            )
            .replace(/VALOR_LEGAJO\("([^"]*)"\)/g, (_, concepto: string) =>
              String(getValorLegajo(concepto, concept.code))
            )
            .replace(/CONCEPTO\((\d+)\)/g, (_, refId: string) => {
              const value = values.get(Number(refId));
              if (value === undefined) throw new Error("missing CONCEPTO dep");
              return toExpressionLiteral(value);
            })
            .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, refCode: string) => {
              const refId = conceptIdByCode.get(refCode);
              if (!refId) throw new Error("missing CCONCEPTO code");
              const value = values.get(refId);
              if (value === undefined) throw new Error("missing CCONCEPTO dep");
              return toExpressionLiteral(value);
            })
            .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
              const sum = participatingConcepts
                .filter((c) => c.tags.includes(tag))
                .reduce((acc, c) => acc + toNumericOrZero(values.get(c.id)), 0);
              return String(sum);
            })
            .replace(/PARAM\("([^"]+)"\)/g, (_, param: string) => {
              const value = params[param];
              if (value === undefined) throw new Error("missing PARAM");
              return String(value);
            })
            .replace(/ANTERIORES\(\)/g, () => String(getAnterioresByType(concept.id, concept.conceptType, values)))
            .replace(/ANTIGUEDAD\(\)/g, () => String(getAntiguedadYears()))
            .replace(/TAG_OP\("([^"]+)","([^"]+)"\)/g, (_, op: TagAggregationOp, tag: string) => {
              const tagged = participatingConcepts
                .filter((c) => c.tags.includes(tag))
                .map((c) => toNumericOrZero(values.get(c.id)));
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

          const excelLike = normalizeExcelComparators(
            normalizeExcelIf(applyImplicitPlusBetweenValues(normalized))
          );
          let result: unknown;
          result = Function(
            `"use strict"; const IF = (cond, v, f) => (cond ? v : f); return (${excelLike});`
          )();
          values.set(id, applyConceptSign(concept, result));
        } catch (error) {
          const message = error instanceof Error ? error.message : "error de compilacion";
          const compiled = normalizeExcelComparators(
            normalizeExcelIf(
              applyImplicitPlusBetweenValues(
                expandBracketBlocksToExpressions(expression)
              )
                .replace(/%\s*(-?\d+(?:\.\d+)?)/g, "* ($1) / 100")
                .replace(/(-?\d+(?:\.\d+)?)\s*%/g, "($1 / 100)")
                .replace(/\[/g, "(")
                .replace(/\]/g, ")")
            )
          );
          throw new Error(
            `[${concept.code}] ${message}. Original: ${expression.slice(0, 160)}${
              expression.length > 160 ? "..." : ""
            } Compilada: ${compiled.slice(0, 220)}${compiled.length > 220 ? "..." : ""}`
          );
        }
      }

      return {
        value: values.get(selectedConcept.id) ?? null,
        error: null as string | null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "error de compilacion";
      return {
        value: null as unknown | null,
        error: message
      };
    }
  }, [
    editingId,
    selectedConcept,
    participatingConcepts,
    simLegajo,
    simLegajoId,
    simMonth,
    simYear,
    liquidacionesHistory,
    activeReceipt.definitiveOrder,
    activeReceipt.transitoryOrder
  ]);
  const dagOrderById = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
    const receiptOrder = [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder];
    const receiptIndexById = new Map<number, number>(receiptOrder.map((id, index) => [id, index]));
    const incoming = new Map<number, number>();
    const outgoing = new Map<number, number[]>();
    const ids = participatingConcepts.map((c) => c.id);

    for (const id of ids) {
      incoming.set(id, 0);
      outgoing.set(id, []);
    }

    const conceptIdRefs = /CONCEPTO\((\d+)\)/g;
    const conceptCodeRefs = /CCONCEPTO\("([^"]+)"\)/g;
    const sumTagRefs = /SUM_TAG\("([^"]+)"\)/g;
    const tagOpRefs = /TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g;

    for (const concept of participatingConcepts) {
      const expression = conceptExpression(concept);
      const seenDeps = new Set<number>();
      for (const match of expression.matchAll(conceptIdRefs)) {
        const depId = Number(match[1]);
        if (!conceptById.has(depId) || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      for (const match of expression.matchAll(conceptCodeRefs)) {
        const depId = conceptIdByCode.get(match[1]);
        if (!depId || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      const tagDeps = new Set<string>();
      for (const m of expression.matchAll(sumTagRefs)) tagDeps.add(m[1]);
      for (const m of expression.matchAll(tagOpRefs)) tagDeps.add(m[2]);
      for (const tag of tagDeps) {
        for (const depConcept of participatingConcepts) {
          if (!depConcept.tags.includes(tag)) continue;
          if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
          seenDeps.add(depConcept.id);
          outgoing.get(depConcept.id)?.push(concept.id);
          incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
        }
      }
      if (/ANTERIORES\(\)/.test(expression)) {
        const currentOrder = receiptIndexById.get(concept.id);
        if (currentOrder !== undefined) {
          for (const depConcept of participatingConcepts) {
            if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
            if (depConcept.conceptType !== concept.conceptType) continue;
            const depOrder = receiptIndexById.get(depConcept.id);
            if (depOrder === undefined || depOrder >= currentOrder) continue;
            seenDeps.add(depConcept.id);
            outgoing.get(depConcept.id)?.push(concept.id);
            incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
          }
        }
      }
    }

    const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
    const orderById = new Map<number, number>();
    let order = 1;

    while (queue.length) {
      const current = queue.shift()!;
      if (!orderById.has(current)) {
        orderById.set(current, order++);
      }
      for (const next of outgoing.get(current) ?? []) {
        const nextIncoming = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, nextIncoming);
        if (nextIncoming === 0) {
          queue.push(next);
        }
      }
    }

    for (const id of ids) {
      if (!orderById.has(id)) {
        orderById.set(id, order++);
      }
    }
    return orderById;
  }, [
    participatingConcepts,
    simLegajo,
    simLegajoId,
    simMonth,
    simYear,
    liquidacionesHistory,
    activeReceipt.definitiveOrder,
    activeReceipt.transitoryOrder
  ]);
  const cycleConceptIds = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
    const receiptOrder = [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder];
    const receiptIndexById = new Map<number, number>(receiptOrder.map((id, index) => [id, index]));
    const incoming = new Map<number, number>();
    const outgoing = new Map<number, number[]>();
    const ids = participatingConcepts.map((c) => c.id);

    for (const id of ids) {
      incoming.set(id, 0);
      outgoing.set(id, []);
    }

    const conceptIdRefs = /CONCEPTO\((\d+)\)/g;
    const conceptCodeRefs = /CCONCEPTO\("([^"]+)"\)/g;
    const sumTagRefs = /SUM_TAG\("([^"]+)"\)/g;
    const tagOpRefs = /TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g;

    for (const concept of participatingConcepts) {
      const expression = conceptExpression(concept);
      const seenDeps = new Set<number>();
      for (const match of expression.matchAll(conceptIdRefs)) {
        const depId = Number(match[1]);
        if (!conceptById.has(depId) || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      for (const match of expression.matchAll(conceptCodeRefs)) {
        const depId = conceptIdByCode.get(match[1]);
        if (!depId || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      const tagDeps = new Set<string>();
      for (const m of expression.matchAll(sumTagRefs)) tagDeps.add(m[1]);
      for (const m of expression.matchAll(tagOpRefs)) tagDeps.add(m[2]);
      for (const tag of tagDeps) {
        for (const depConcept of participatingConcepts) {
          if (!depConcept.tags.includes(tag)) continue;
          if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
          seenDeps.add(depConcept.id);
          outgoing.get(depConcept.id)?.push(concept.id);
          incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
        }
      }
      if (/ANTERIORES\(\)/.test(expression)) {
        const currentOrder = receiptIndexById.get(concept.id);
        if (currentOrder !== undefined) {
          for (const depConcept of participatingConcepts) {
            if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
            if (depConcept.conceptType !== concept.conceptType) continue;
            const depOrder = receiptIndexById.get(depConcept.id);
            if (depOrder === undefined || depOrder >= currentOrder) continue;
            seenDeps.add(depConcept.id);
            outgoing.get(depConcept.id)?.push(concept.id);
            incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
          }
        }
      }
    }

    const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of outgoing.get(current) ?? []) {
        const nextIncoming = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, nextIncoming);
        if (nextIncoming === 0) queue.push(next);
      }
    }

    return new Set(ids.filter((id) => (incoming.get(id) ?? 0) > 0));
  }, [
    participatingConcepts,
    simLegajo,
    simLegajoId,
    simMonth,
    simYear,
    liquidacionesHistory,
    activeReceipt.definitiveOrder,
    activeReceipt.transitoryOrder
  ]);
  const formulaErrorById = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
    const receiptOrder = [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder];
    const receiptIndexById = new Map<number, number>(receiptOrder.map((id, index) => [id, index]));
    const incoming = new Map<number, number>();
    const outgoing = new Map<number, number[]>();
    const ids = participatingConcepts.map((c) => c.id);

    for (const id of ids) {
      incoming.set(id, 0);
      outgoing.set(id, []);
    }

    const conceptIdRefs = /CONCEPTO\((\d+)\)/g;
    const conceptCodeRefs = /CCONCEPTO\("([^"]+)"\)/g;
    const sumTagRefs = /SUM_TAG\("([^"]+)"\)/g;
    const tagOpRefs = /TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g;

    for (const concept of participatingConcepts) {
      const expression = conceptExpression(concept);
      const seenDeps = new Set<number>();
      for (const m of expression.matchAll(conceptIdRefs)) {
        const depId = Number(m[1]);
        if (!conceptById.has(depId) || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      for (const m of expression.matchAll(conceptCodeRefs)) {
        const depId = conceptIdByCode.get(m[1]);
        if (!depId || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      const tagDeps = new Set<string>();
      for (const m of expression.matchAll(sumTagRefs)) tagDeps.add(m[1]);
      for (const m of expression.matchAll(tagOpRefs)) tagDeps.add(m[2]);
      for (const tag of tagDeps) {
        for (const depConcept of participatingConcepts) {
          if (!depConcept.tags.includes(tag)) continue;
          if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
          seenDeps.add(depConcept.id);
          outgoing.get(depConcept.id)?.push(concept.id);
          incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
        }
      }
      if (/ANTERIORES\(\)/.test(expression)) {
        const currentOrder = receiptIndexById.get(concept.id);
        if (currentOrder !== undefined) {
          for (const depConcept of participatingConcepts) {
            if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
            if (depConcept.conceptType !== concept.conceptType) continue;
            const depOrder = receiptIndexById.get(depConcept.id);
            if (depOrder === undefined || depOrder >= currentOrder) continue;
            seenDeps.add(depConcept.id);
            outgoing.get(depConcept.id)?.push(concept.id);
            incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
          }
        }
      }
    }

    const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
    const topo: number[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      topo.push(current);
      for (const next of outgoing.get(current) ?? []) {
        const left = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, left);
        if (left === 0) queue.push(next);
      }
    }
    for (const id of ids) {
      if (!topo.includes(id)) topo.push(id);
    }

    const values = new Map<number, unknown>();
    const errors = new Map<number, boolean>();
    const params: Record<string, number> = { porc_antiguedad: 0.12 };

    for (const id of topo) {
      const concept = conceptById.get(id);
      if (!concept) continue;
      const expression = conceptExpression(concept);
      if (!expression.trim()) {
        values.set(id, 0);
        errors.set(id, false);
        continue;
      }

      try {
        const normalized = expandBracketBlocksToExpressions(expression)
          .replace(/VALOR_FIJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
            const code = resolveValorLegajoConceptCode(rawArg, concept.code);
            return String(getValorLegajo(code, concept.code));
          })
          .replace(/VALOR_LEGAJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
            const code = resolveValorLegajoConceptCode(rawArg, concept.code);
            return String(getValorLegajo(code, concept.code));
          })
          .replace(/MES_ANTERIOR_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArgs: string) =>
            String(resolveMesAnteriorValue(rawArgs))
          )
          .replace(/VALOR_FIJO\("([^"]*)"\)/g, (_, concepto: string) =>
            String(getValorLegajo(concepto, concept.code))
          )
          .replace(/VALOR_LEGAJO\("([^"]*)"\)/g, (_, concepto: string) =>
            String(getValorLegajo(concepto, concept.code))
          )
          .replace(/CONCEPTO\((\d+)\)/g, (_, refId: string) => {
            const value = values.get(Number(refId));
            if (value === undefined) throw new Error("missing CONCEPTO dep");
            return toExpressionLiteral(value);
          })
          .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, refCode: string) => {
            const refId = conceptIdByCode.get(refCode);
            if (!refId) throw new Error("missing CCONCEPTO code");
            const value = values.get(refId);
            if (value === undefined) throw new Error("missing CCONCEPTO dep");
            return toExpressionLiteral(value);
          })
          .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
            const sum = participatingConcepts
              .filter((c) => c.tags.includes(tag))
              .reduce((acc, c) => acc + toNumericOrZero(values.get(c.id)), 0);
            return String(sum);
          })
          .replace(/PARAM\("([^"]+)"\)/g, (_, param: string) => {
            const value = params[param];
            if (value === undefined) throw new Error("missing PARAM");
            return String(value);
          })
          .replace(/ANTERIORES\(\)/g, () => String(getAnterioresByType(concept.id, concept.conceptType, values)))
          .replace(/ANTIGUEDAD\(\)/g, () => String(getAntiguedadYears()))
          .replace(/TAG_OP\("([^"]+)","([^"]+)"\)/g, (_, op: TagAggregationOp, tag: string) => {
            const tagged = participatingConcepts
              .filter((c) => c.tags.includes(tag))
              .map((c) => toNumericOrZero(values.get(c.id)));
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

        const excelLike = normalizeExcelComparators(
          normalizeExcelIf(applyImplicitPlusBetweenValues(normalized))
        );
        const result = Function(
          `"use strict"; const IF = (cond, v, f) => (cond ? v : f); return (${excelLike});`
        )();
        values.set(id, applyConceptSign(concept, result));
        errors.set(id, false);
      } catch {
        values.set(id, 0);
        errors.set(id, true);
      }
    }

    return errors;
  }, [
    participatingConcepts,
    simLegajo,
    simLegajoId,
    simMonth,
    simYear,
    liquidacionesHistory,
    activeReceipt.definitiveOrder,
    activeReceipt.transitoryOrder
  ]);
  const previewValueById = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
    const receiptOrder = [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder];
    const receiptIndexById = new Map<number, number>(receiptOrder.map((id, index) => [id, index]));
    const incoming = new Map<number, number>();
    const outgoing = new Map<number, number[]>();
    const ids = participatingConcepts.map((c) => c.id);

    for (const id of ids) {
      incoming.set(id, 0);
      outgoing.set(id, []);
    }

    const conceptIdRefs = /CONCEPTO\((\d+)\)/g;
    const conceptCodeRefs = /CCONCEPTO\("([^"]+)"\)/g;
    const sumTagRefs = /SUM_TAG\("([^"]+)"\)/g;
    const tagOpRefs = /TAG_OP\("(sum|avg|max|min)","([^"]+)"\)/g;

    for (const concept of participatingConcepts) {
      const expression = conceptExpression(concept);
      const seenDeps = new Set<number>();
      for (const m of expression.matchAll(conceptIdRefs)) {
        const depId = Number(m[1]);
        if (!conceptById.has(depId) || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      for (const m of expression.matchAll(conceptCodeRefs)) {
        const depId = conceptIdByCode.get(m[1]);
        if (!depId || depId === concept.id || seenDeps.has(depId)) continue;
        seenDeps.add(depId);
        outgoing.get(depId)?.push(concept.id);
        incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
      }
      const tagDeps = new Set<string>();
      for (const m of expression.matchAll(sumTagRefs)) tagDeps.add(m[1]);
      for (const m of expression.matchAll(tagOpRefs)) tagDeps.add(m[2]);
      for (const tag of tagDeps) {
        for (const depConcept of participatingConcepts) {
          if (!depConcept.tags.includes(tag)) continue;
          if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
          seenDeps.add(depConcept.id);
          outgoing.get(depConcept.id)?.push(concept.id);
          incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
        }
      }
      if (/ANTERIORES\(\)/.test(expression)) {
        const currentOrder = receiptIndexById.get(concept.id);
        if (currentOrder !== undefined) {
          for (const depConcept of participatingConcepts) {
            if (depConcept.id === concept.id || seenDeps.has(depConcept.id)) continue;
            if (depConcept.conceptType !== concept.conceptType) continue;
            const depOrder = receiptIndexById.get(depConcept.id);
            if (depOrder === undefined || depOrder >= currentOrder) continue;
            seenDeps.add(depConcept.id);
            outgoing.get(depConcept.id)?.push(concept.id);
            incoming.set(concept.id, (incoming.get(concept.id) ?? 0) + 1);
          }
        }
      }
    }

    const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
    const topo: number[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      topo.push(current);
      for (const next of outgoing.get(current) ?? []) {
        const left = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, left);
        if (left === 0) queue.push(next);
      }
    }
    for (const id of ids) {
      if (!topo.includes(id)) topo.push(id);
    }

    const values = new Map<number, unknown>();
    const params: Record<string, number> = { porc_antiguedad: 0.12 };

    for (const id of topo) {
      const concept = conceptById.get(id);
      if (!concept) continue;
      const expression = conceptExpression(concept);
      if (!expression.trim()) {
        values.set(id, 0);
        continue;
      }

      try {
        const normalized = expandBracketBlocksToExpressions(expression)
          .replace(/VALOR_FIJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
            const code = resolveValorLegajoConceptCode(rawArg, concept.code);
            return String(getValorLegajo(code, concept.code));
          })
          .replace(/VALOR_LEGAJO_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArg: string) => {
            const code = resolveValorLegajoConceptCode(rawArg, concept.code);
            return String(getValorLegajo(code, concept.code));
          })
          .replace(/MES_ANTERIOR_ARG\[\[([\s\S]*?)\]\]/g, (_, rawArgs: string) =>
            String(resolveMesAnteriorValue(rawArgs))
          )
          .replace(/VALOR_FIJO\("([^"]*)"\)/g, (_, concepto: string) =>
            String(getValorLegajo(concepto, concept.code))
          )
          .replace(/VALOR_LEGAJO\("([^"]*)"\)/g, (_, concepto: string) =>
            String(getValorLegajo(concepto, concept.code))
          )
          .replace(/CONCEPTO\((\d+)\)/g, (_, refId: string) => {
            const value = values.get(Number(refId));
            if (value === undefined) throw new Error("missing CONCEPTO dep");
            return toExpressionLiteral(value);
          })
          .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, refCode: string) => {
            const refId = conceptIdByCode.get(refCode);
            if (!refId) throw new Error("missing CCONCEPTO code");
            const value = values.get(refId);
            if (value === undefined) throw new Error("missing CCONCEPTO dep");
            return toExpressionLiteral(value);
          })
          .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
            const sum = participatingConcepts
              .filter((c) => c.tags.includes(tag))
              .reduce((acc, c) => acc + toNumericOrZero(values.get(c.id)), 0);
            return String(sum);
          })
          .replace(/PARAM\("([^"]+)"\)/g, (_, param: string) => {
            const value = params[param];
            if (value === undefined) throw new Error("missing PARAM");
            return String(value);
          })
          .replace(/ANTERIORES\(\)/g, () => String(getAnterioresByType(concept.id, concept.conceptType, values)))
          .replace(/ANTIGUEDAD\(\)/g, () => String(getAntiguedadYears()))
          .replace(/TAG_OP\("([^"]+)","([^"]+)"\)/g, (_, op: TagAggregationOp, tag: string) => {
            const tagged = participatingConcepts
              .filter((c) => c.tags.includes(tag))
              .map((c) => toNumericOrZero(values.get(c.id)));
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

        const excelLike = normalizeExcelComparators(
          normalizeExcelIf(applyImplicitPlusBetweenValues(normalized))
        );
        const result = Function(
          `"use strict"; const IF = (cond, v, f) => (cond ? v : f); return (${excelLike});`
        )();
        values.set(id, applyConceptSign(concept, result));
      } catch {
        values.set(id, 0);
      }
    }

    return values;
  }, [
    participatingConcepts,
    simLegajo,
    simLegajoId,
    simMonth,
    simYear,
    liquidacionesHistory,
    activeReceipt.definitiveOrder,
    activeReceipt.transitoryOrder
  ]);

  const reorderDefinitivo = (dragId: number, dropId: number) => {
    const dragConcept = concepts.find((c) => c.id === dragId);
    const dropConcept = concepts.find((c) => c.id === dropId);
    if (!dragConcept || !dropConcept) return;
    if (dragConcept.conceptClass !== "definitivo" || dropConcept.conceptClass !== "definitivo") return;

    setReceipts((prev) =>
      prev.map((receipt) => {
        if (receipt.id !== activeReceiptId) return receipt;
        const withoutDragged = receipt.definitiveOrder.filter((id) => id !== dragId);
        const targetIndex = withoutDragged.findIndex((id) => id === dropId);
        withoutDragged.splice(targetIndex, 0, dragId);
        return { ...receipt, definitiveOrder: withoutDragged };
      })
    );
  };

  const addTransitory = () => {
    const newId = Math.max(...concepts.map((c) => c.id)) + 1;
    const newConcept: ConceptModel = {
      id: newId,
      code: `TRANS_${newId}`,
      name: `Transitorio ${newId}`,
      conceptClass: "transitorio",
      conceptType: "remunerativo",
      color: colorPalette30[(newId - 1) % colorPalette30.length],
      shape: shapeCycle[(newId - 1) % shapeCycle.length],
      tags: [implicitTagForType("remunerativo")],
      formulaAst: []
    };
    setConcepts((prev) => [...prev, newConcept]);
    setReceipts((prev) =>
      prev.map((receipt) =>
        receipt.id === activeReceiptId
          ? { ...receipt, transitoryOrder: [...receipt.transitoryOrder, newId] }
          : receipt
      )
    );
    setEditingId(newId);
  };

  const addDefinitiveToReceipt = () => {
    const newId = Math.max(...concepts.map((c) => c.id)) + 1;
    const newConcept: ConceptModel = {
      id: newId,
      code: `DEF_${newId}`,
      name: `Concepto definitivo ${newId}`,
      conceptClass: "definitivo",
      conceptType: "remunerativo",
      color: colorPalette30[(newId - 1) % colorPalette30.length],
      shape: shapeCycle[(newId - 1) % shapeCycle.length],
      tags: [implicitTagForType("remunerativo")],
      formulaAst: []
    };
    setConcepts((prev) => [...prev, newConcept]);
    setReceipts((prev) =>
      prev.map((receipt) =>
        receipt.id === activeReceiptId
          ? { ...receipt, definitiveOrder: [...receipt.definitiveOrder, newId] }
          : receipt
      )
    );
    setEditingId(newId);
  };

  const setSelectedConceptReceiptMembership = (receiptId: string, shouldBelong: boolean) => {
    const conceptId = selectedConcept.id;
    const isDefinitive = selectedConcept.conceptClass === "definitivo";
    setReceipts((prev) =>
      prev.map((receipt) => {
        if (receipt.id !== receiptId) return receipt;
        if (isDefinitive) {
          const exists = receipt.definitiveOrder.includes(conceptId);
          if (shouldBelong && !exists) {
            return { ...receipt, definitiveOrder: [...receipt.definitiveOrder, conceptId] };
          }
          if (!shouldBelong && exists) {
            return { ...receipt, definitiveOrder: receipt.definitiveOrder.filter((id) => id !== conceptId) };
          }
          return receipt;
        }
        const exists = receipt.transitoryOrder.includes(conceptId);
        if (shouldBelong && !exists) {
          return { ...receipt, transitoryOrder: [...receipt.transitoryOrder, conceptId] };
        }
        if (!shouldBelong && exists) {
          return { ...receipt, transitoryOrder: receipt.transitoryOrder.filter((id) => id !== conceptId) };
        }
        return receipt;
      })
    );
  };

  const setSelectedConceptMembershipByLiquidationType = (
    liquidationType: string,
    shouldBelong: boolean
  ) => {
    const conceptId = selectedConcept.id;
    const isDefinitive = selectedConcept.conceptClass === "definitivo";
    const conveniosScope = selectedConveniosForIntersection.length
      ? new Set(selectedConveniosForIntersection)
      : null;
    setReceipts((prev) =>
      prev.map((receipt) => {
        if (receipt.liquidationType !== liquidationType) return receipt;
        if (conveniosScope && !conveniosScope.has(receipt.convenio)) return receipt;
        if (isDefinitive) {
          const exists = receipt.definitiveOrder.includes(conceptId);
          if (shouldBelong && !exists) {
            return { ...receipt, definitiveOrder: [...receipt.definitiveOrder, conceptId] };
          }
          if (!shouldBelong && exists) {
            return { ...receipt, definitiveOrder: receipt.definitiveOrder.filter((id) => id !== conceptId) };
          }
          return receipt;
        }
        const exists = receipt.transitoryOrder.includes(conceptId);
        if (shouldBelong && !exists) {
          return { ...receipt, transitoryOrder: [...receipt.transitoryOrder, conceptId] };
        }
        if (!shouldBelong && exists) {
          return { ...receipt, transitoryOrder: receipt.transitoryOrder.filter((id) => id !== conceptId) };
        }
        return receipt;
      })
    );
  };

  const setSelectedConceptMembershipByConvenio = (convenio: string, shouldBelong: boolean) => {
    const conceptId = selectedConcept.id;
    const isDefinitive = selectedConcept.conceptClass === "definitivo";
    const liquidationTypesScope = selectedLiquidationTypesForIntersection.length
      ? new Set(selectedLiquidationTypesForIntersection)
      : null;
    setReceipts((prev) =>
      prev.map((receipt) => {
        if (receipt.convenio !== convenio) return receipt;
        if (liquidationTypesScope && !liquidationTypesScope.has(receipt.liquidationType)) return receipt;
        if (isDefinitive) {
          const exists = receipt.definitiveOrder.includes(conceptId);
          if (shouldBelong && !exists) {
            return { ...receipt, definitiveOrder: [...receipt.definitiveOrder, conceptId] };
          }
          if (!shouldBelong && exists) {
            return { ...receipt, definitiveOrder: receipt.definitiveOrder.filter((id) => id !== conceptId) };
          }
          return receipt;
        }
        const exists = receipt.transitoryOrder.includes(conceptId);
        if (shouldBelong && !exists) {
          return { ...receipt, transitoryOrder: [...receipt.transitoryOrder, conceptId] };
        }
        if (!shouldBelong && exists) {
          return { ...receipt, transitoryOrder: receipt.transitoryOrder.filter((id) => id !== conceptId) };
        }
        return receipt;
      })
    );
  };

  const addTagToSelectedConcept = (tagInput: string) => {
    const normalized = tagInput.trim().toLowerCase();
    if (!normalized) return;
    setConcepts((prev) =>
      prev.map((c) => {
        if (c.id !== selectedConcept.id) return c;
        if (implicitTypeTagValues.has(normalized)) {
          return { ...c, tags: normalizeTagsWithImplicitType(c.tags, c.conceptType) };
        }
        if (c.tags.includes(normalized)) return c;
        return { ...c, tags: normalizeTagsWithImplicitType([...c.tags, normalized], c.conceptType) };
      })
    );
    setNewTagDraft("");
  };

  const updateSelectedConceptCode = (nextValue: string) => {
    setConceptCodeDraft(nextValue);
    const nextCode = nextValue.trim();
    if (!nextCode) return;
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, code: nextCode.toUpperCase() }
          : c
      )
    );
  };

  const updateSelectedConceptName = (nextValue: string) => {
    setConceptNameDraft(nextValue);
    const nextName = nextValue.trim();
    if (!nextName) return;
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, name: nextName }
          : c
      )
    );
  };

  const updateSelectedConceptType = (nextType: ConceptTypeId) => {
    setConceptTypeDraft(nextType);
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, conceptType: nextType, tags: normalizeTagsWithImplicitType(c.tags, nextType) }
          : c
      )
    );
  };

  const updateSelectedConceptF1359Field = (f1359FieldId: string) => {
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, f1359FieldId: f1359FieldId.trim() }
          : c
      )
    );
  };

  const deleteSelectedConcept = () => {
    if (concepts.length <= 1) return;
    const removingId = selectedConcept.id;
    const ok = window.confirm(
      `¿Eliminar concepto ${selectedConcept.code} - ${selectedConcept.name}?`
    );
    if (!ok) return;
    void fetch(`${apiBaseUrl}/concepts/${removingId}`, { method: "DELETE" });
    const remaining = concepts.filter((c) => c.id !== removingId);
    setConcepts(remaining);
    setReceipts((prev) =>
      prev.map((receipt) => ({
        ...receipt,
        definitiveOrder: receipt.definitiveOrder.filter((id) => id !== removingId),
        transitoryOrder: receipt.transitoryOrder.filter((id) => id !== removingId)
      }))
    );
    const nextSelected = remaining[0];
    if (nextSelected) {
      setEditingId(nextSelected.id);
    }
  };

  const updateSelectedAppearance = (patch: Partial<Pick<ConceptModel, "shape" | "color">>) => {
    setConcepts((prev) =>
      prev.map((c) => (c.id === selectedConcept.id ? { ...c, ...patch } : c))
    );
  };

  const removeTagFromSelectedConcept = (tagToRemove: string) => {
    if (tagToRemove === implicitTagForType(selectedConcept.conceptType)) return;
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? {
              ...c,
              tags: normalizeTagsWithImplicitType(
                c.tags.filter((tag) => tag !== tagToRemove),
                c.conceptType
              )
            }
          : c
      )
    );
  };

  const handleTagDraftChange = (nextValue: string) => {
    setNewTagDraft(nextValue);
    const normalized = nextValue.trim().toLowerCase();
    if (!normalized) return;
    if (!allTags.includes(normalized)) return;
    addTagToSelectedConcept(nextValue);
  };

  useEffect(() => {
    setConcepts((prev) => {
      const next = prev.map((concept) => {
        const normalizedTags = normalizeTagsWithImplicitType(concept.tags ?? [], concept.conceptType);
        const currentTags = concept.tags ?? [];
        const unchanged =
          normalizedTags.length === currentTags.length &&
          normalizedTags.every((tag, i) => tag === currentTags[i]);
        return unchanged ? concept : { ...concept, tags: normalizedTags };
      });
      const changed = next.some((concept, i) => concept !== prev[i]);
      return changed ? next : prev;
    });
  }, [setConcepts]);

  const applyTagAggregation = (op: TagAggregationOp) => {
    const opLabels: Record<TagAggregationOp, string> = {
      sum: "Suma de",
      avg: "Promedio de",
      max: "Maximo de",
      min: "Minimo de"
    };
    insertTokenAt(
      token(
        `${opLabels[op]} #${tagModal.tag}`,
        `TAG_OP("${op}","${tagModal.tag}")`,
        "function"
      ),
      tagModal.insertAt
    );
    setTagModal({ open: false, tag: "", insertAt: 0 });
  };


  useEffect(() => {
    setConceptCodeDraft(selectedConcept.code);
    setConceptNameDraft(selectedConcept.name);
    setConceptTypeDraft(selectedConcept.conceptType ?? "remunerativo");
  }, [selectedConcept.id, selectedConcept.code, selectedConcept.name, selectedConcept.conceptType]);

  useEffect(() => {
    if (!appearanceOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!appearanceRef.current) return;
      if (appearanceRef.current.contains(event.target as Node)) return;
      setAppearanceOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [appearanceOpen]);

  useEffect(() => {
    if (!liquidacionesMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!liquidacionesMenuRef.current) return;
      if (liquidacionesMenuRef.current.contains(event.target as Node)) return;
      setLiquidacionesMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [liquidacionesMenuOpen]);

  useEffect(() => {
    if (!membershipTypeDropdownOpen && !membershipConvenioDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (membershipTypeComboRef.current?.contains(target)) return;
      if (membershipConvenioComboRef.current?.contains(target)) return;
      setMembershipTypeDropdownOpen(false);
      setMembershipConvenioDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [membershipTypeDropdownOpen, membershipConvenioDropdownOpen]);

  useEffect(() => {
    const loadConcepts = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/concepts`);
        if (!response.ok) {
          setConceptsLoaded(true);
          return;
        }
        const apiConcepts = (await response.json()) as ApiConcept[];
        if (apiConcepts.length > 0) {
          const conceptCodeById = Object.fromEntries(
            apiConcepts.map((item) => [item.id, item.code])
          ) as Record<number, string>;
          const hydrated = apiConcepts.map((item) => fromApiConcept(item, conceptCodeById));
          setConcepts(hydrated);
        }
      } catch {
        // Mantiene seed local si API no esta disponible.
      } finally {
        setConceptsLoaded(true);
      }
    };
    void loadConcepts();
  }, []);

  useEffect(() => {
    if (!composiciones.length || !legajos.length) return;
    let changed = false;
    const normalize = (value: string | undefined): string => (value ?? "").trim().toLowerCase();
    const migrated = legajos.map((legajo) => {
      const selected = (legajo.composicionSalarial ?? "").trim();
      if (!selected) return legajo;
      const byId = composiciones.find(
        (c) =>
          c.id === selected &&
          normalize(c.convenio) === normalize(legajo.convenio)
      );
      if (byId) return legajo;
      const byCode = composiciones.find(
        (c) =>
          normalize(c.code) === normalize(selected) &&
          normalize(c.convenio) === normalize(legajo.convenio)
      );
      if (!byCode) return legajo;
      changed = true;
      return { ...legajo, composicionSalarial: byCode.id };
    });
    if (changed) {
      setLegajos(migrated);
    }
  }, [composiciones, legajos]);

  useEffect(() => {
    const loadLegajos = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/legajos`);
        if (!response.ok) {
          setLegajosLoaded(true);
          return;
        }
        const apiLegajos = (await response.json()) as LegajoModel[];
        setLegajos(
          (apiLegajos ?? []).map((item) => ({
            ...item,
            convenio: item.convenio ?? "",
            composicionSalarial: item.composicionSalarial ?? "",
            valoresFijos: Array.isArray(item.valoresFijos) ? item.valoresFijos : []
          })).map((item) => ({
            ...item,
            valoresFijos: item.valoresFijos.map((vf) => ({
              id: vf.id,
              clave: (vf as { clave?: string; concepto?: string }).clave ??
                (vf as { clave?: string; concepto?: string }).concepto ??
                "",
              valor: vf.valor
            }))
          }))
        );
      } catch {
        // Mantiene estado local en memoria si API no esta disponible.
      } finally {
        setLegajosLoaded(true);
      }
    };
    void loadLegajos();
  }, []);

  useEffect(() => {
    const loadComposiciones = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/composiciones-salariales`);
        if (!response.ok) return;
        const parsed = (await response.json()) as ComposicionSalarialModel[];
        setComposiciones(
          (parsed ?? []).map((item) => ({
            ...item,
            convenio: item.convenio ?? "",
            valoresFijos: Array.isArray(item.valoresFijos)
              ? item.valoresFijos.map((vf) => ({
                  id: vf.id,
                  clave: (vf as { clave?: string; concepto?: string }).clave ??
                    (vf as { clave?: string; concepto?: string }).concepto ??
                    "",
                  valor: vf.valor
                }))
              : []
          }))
        );
      } catch {
        // noop
      }
    };
    void loadComposiciones();
  }, []);

  useEffect(() => {
    const loadConvenios = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/convenios`);
        if (!response.ok) return;
        const parsed = (await response.json()) as string[];
        if (Array.isArray(parsed) && parsed.length) setConvenioOptions(parsed);
      } catch {
        // Mantiene convenios por defecto.
      }
    };
    void loadConvenios();
  }, []);

  useEffect(() => {
    const loadF1359Fields = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/f1359-fields`);
        if (!response.ok) return;
        const parsed = (await response.json()) as ApiF1359Field[];
        setF1359Fields(Array.isArray(parsed) ? parsed : []);
      } catch {
        // noop
      }
    };
    void loadF1359Fields();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(receiptF1359FilterStorageKey, receiptF1359Filter);
  }, [receiptF1359Filter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(receiptTagFilterStorageKey, receiptTagFilter);
  }, [receiptTagFilter]);

  useEffect(() => {
    const loadReceipts = async () => {
      const fallbackOrder = initialConcepts
        .filter((concept) => concept.conceptClass === "definitivo")
        .map((concept) => concept.id);
      try {
        const response = await fetch(`${apiBaseUrl}/receipts`);
        if (!response.ok) {
          setReceiptsLoaded(true);
          return;
        }
        const parsed = (await response.json()) as ApiReceipt[];
        const normalizedFromApi = (Array.isArray(parsed) ? parsed : [])
          .map((item) => parseApiReceipt(item, fallbackOrder))
          .filter((item): item is ReceiptModel => Boolean(item));

        if (normalizedFromApi.length > 0) {
          setReceipts(ensureReceiptMatrix(normalizedFromApi, defaultConvenios, fallbackOrder));
          return;
        }

        if (typeof window !== "undefined") {
          const rawLegacy = window.localStorage.getItem(legacyReceiptsStorageKey);
          if (rawLegacy) {
            const legacyParsed = JSON.parse(rawLegacy) as ReceiptModel[];
            const normalizedLegacy = ensureReceiptMatrix(
              Array.isArray(legacyParsed) ? legacyParsed : [],
              defaultConvenios,
              fallbackOrder
            );
            if (normalizedLegacy.length > 0) {
              setReceipts(normalizedLegacy);
            }
          }
        }
      } catch {
        // Mantiene estado inicial en memoria si API no esta disponible.
      } finally {
        setReceiptsLoaded(true);
      }
    };
    void loadReceipts();
  }, []);

  useEffect(() => {
    const loadLiquidaciones = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/liquidaciones`);
        if (!response.ok) return;
        const parsed = (await response.json()) as HistoricalLiquidacionRecord[];
        setLiquidacionesHistory(Array.isArray(parsed) ? parsed : []);
      } catch {
        // noop
      }
    };
    void loadLiquidaciones();
  }, []);

  useEffect(() => {
    if (!conceptsLoaded) return;
    const timeout = setTimeout(() => {
      void Promise.allSettled(concepts.map((concept) => persistConcept(concept)));
    }, 250);
    return () => clearTimeout(timeout);
  }, [concepts, conceptsLoaded]);

  useEffect(() => {
    if (!receiptsLoaded) return;
    const timeout = setTimeout(() => {
      const payload: ApiReceipt[] = receipts.map((receipt) => ({
        id: receipt.id,
        convenio: receipt.convenio,
        liquidationType: receipt.liquidationType,
        definitiveOrder: receipt.definitiveOrder,
        transitoryOrder: receipt.transitoryOrder
      }));
      void fetch(`${apiBaseUrl}/receipts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [receipts, receiptsLoaded]);

  useEffect(() => {
    setReceipts((prev) => {
      const normalized = ensureReceiptMatrix(prev, convenios, defaultReceiptOrder);
      if (
        normalized.length === prev.length &&
        normalized.every(
          (receipt, index) =>
            receipt.id === prev[index].id &&
            receipt.convenio === prev[index].convenio &&
            receipt.liquidationType === prev[index].liquidationType &&
            JSON.stringify(receipt.definitiveOrder) === JSON.stringify(prev[index].definitiveOrder) &&
            JSON.stringify(receipt.transitoryOrder) === JSON.stringify(prev[index].transitoryOrder)
        )
      ) {
        return prev;
      }
      return normalized;
    });
  }, [convenios, defaultReceiptOrder]);

  useEffect(() => {
    if (!legajosLoaded) return;
    const timeout = setTimeout(() => {
      void fetch(`${apiBaseUrl}/legajos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legajos)
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [legajos, legajosLoaded]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetch(`${apiBaseUrl}/composiciones-salariales`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(composiciones)
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [composiciones]);

  useEffect(() => {
    if (!simLegajosForConvenio.length) {
      setSimLegajoId("");
      return;
    }
    if (!simLegajoId || !simLegajosForConvenio.some((l) => l.id === simLegajoId)) {
      setSimLegajoId(simLegajosForConvenio[0].id);
    }
  }, [simLegajosForConvenio, simLegajoId]);

  useEffect(() => {
    if (!receipts.length) return;
    const active = receiptsByScreenFilter.find((r) => r.id === activeReceiptId);
    if (active) return;
    if (receiptsByScreenFilter.length) {
      setActiveReceiptId(receiptsByScreenFilter[0].id);
      return;
    }
    setActiveReceiptId(receipts[0]?.id ?? "");
  }, [receipts, receiptsByScreenFilter, activeReceiptId]);

  useEffect(() => {
    if (!conceptsLoaded) return;
    const serialized = JSON.stringify({ concepts, receipts });
    if (!historyLastRef.current) {
      historyLastRef.current = serialized;
      return;
    }
    if (serialized === historyLastRef.current) return;

    if (historyApplyingRef.current) {
      historyApplyingRef.current = false;
      historyLastRef.current = serialized;
      return;
    }

    const previous = JSON.parse(historyLastRef.current) as EditorSnapshot;
    setHistoryPast((prev) => [...prev, previous].slice(-maxHistoryEntries));
    setHistoryFuture([]);
    historyLastRef.current = serialized;
  }, [concepts, receipts, conceptsLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        ((key === "z" && event.shiftKey) || key === "y")
      ) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyPast, historyFuture, concepts, receipts]);

  return (
    <div className="layout">
      <header className="topbar">
        <h1>Playadito Payroll</h1>
        <div className="history-controls">
          <button
            type="button"
            className="history-button"
            onClick={undo}
            disabled={!historyPast.length}
            title="Deshacer (Ctrl+Z)"
          >
            ←
          </button>
          <button
            type="button"
            className="history-button"
            onClick={redo}
            disabled={!historyFuture.length}
            title="Rehacer (Ctrl+Shift+Z)"
          >
            →
          </button>
        </div>
        <nav className="topbar-nav" aria-label="Navegacion principal">
          <button className={menu === "dashboard" ? "menu active" : "menu"} onClick={() => setMenu("dashboard")}>
            Dashboard
          </button>
          <button className={menu === "legajos" ? "menu active" : "menu"} onClick={() => setMenu("legajos")}>
            Legajos
          </button>
          <div className="topbar-dropdown" ref={liquidacionesMenuRef}>
            <button
              className={
                menu === "conceptos" || menu === "composiciones" || menu === "novedades" || menu === "liquidaciones"
                  ? "menu active"
                  : "menu"
              }
              onClick={() => setLiquidacionesMenuOpen((prev) => !prev)}
            >
              Liquidaciones
            </button>
            {liquidacionesMenuOpen ? (
              <div className="topbar-dropdown-menu">
                <button
                  className={menu === "conceptos" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                  onClick={() => {
                    setMenu("conceptos");
                    setLiquidacionesMenuOpen(false);
                  }}
                >
                  Conceptos
                </button>
                <button
                  className={menu === "composiciones" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                  onClick={() => {
                    setMenu("composiciones");
                    setLiquidacionesMenuOpen(false);
                  }}
                >
                  Composiciones Salariales
                </button>
                <button
                  className={menu === "novedades" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                  onClick={() => {
                    setMenu("novedades");
                    setLiquidacionesMenuOpen(false);
                  }}
                >
                  Novedades
                </button>
                <button
                  className={menu === "liquidaciones" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                  onClick={() => {
                    setMenu("liquidaciones");
                    setLiquidacionesMenuOpen(false);
                  }}
                >
                  Liquidacion
                </button>
              </div>
            ) : null}
          </div>
          <button className={menu === "afip" ? "menu active" : "menu"} onClick={() => setMenu("afip")}>
            Contable
          </button>
        </nav>
      </header>

      <main className="content">
        {menu === "legajos" ? (
          <LegajosPage
            legajos={legajos}
            convenioOptions={convenioOptions}
            composiciones={composiciones}
            fixedValueKeys={fixedValueKeys}
            onChangeLegajos={setLegajos}
          />
        ) : menu === "composiciones" ? (
          <ComposicionesSalarialesPage
            composiciones={composiciones}
            convenioOptions={convenioOptions}
            fixedValueKeys={fixedValueKeys}
            onEnsureFixedValueKey={() => {}}
            onChangeComposiciones={setComposiciones}
          />
        ) : menu === "liquidaciones" ? (
          <LiquidacionesPage
            concepts={concepts}
            receipts={receipts}
            legajos={legajos}
            composiciones={composiciones}
          />
        ) : menu !== "conceptos" ? (
          <section className="placeholder">
            <h2>{menu === "dashboard" ? "Dashboard" : menu === "novedades" ? "Novedades" : "Contable"}</h2>
            <p>Seccion en construccion. El foco de este MVP es Conceptos.</p>
          </section>
        ) : (
          <section className="modelo-grid">
            <article className="panel concept-panel">
              <h2>Editor de Recibo</h2>
              <div className="receipt-toolbar">
                <div>
                  <label htmlFor="convenio">Convenio</label>
                  <select
                    id="convenio"
                    value={receiptConvenioFilter}
                    onChange={(e) => {
                      const convenio = e.target.value;
                      setReceiptConvenioFilter(convenio);
                    }}
                  >
                    {convenios.map((convenio) => (
                      <option key={convenio} value={convenio}>
                        {convenio}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="receipt">Tipo de liquidación</label>
                  <select
                    id="receipt"
                    value={receiptLiquidationTypeFilter}
                    onChange={(e) => {
                      setReceiptLiquidationTypeFilter(e.target.value);
                    }}
                  >
                    {receiptLiquidationTypeOptions.map((liquidationType) => (
                      <option key={liquidationType} value={liquidationType}>
                        {liquidationType}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f1359-filter">Filtro campo F1359</label>
                  <select
                    id="f1359-filter"
                    value={receiptF1359Filter}
                    onChange={(e) => setReceiptF1359Filter(e.target.value)}
                  >
                    <option value="">Sin filtro</option>
                    {f1359Fields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {`Reg ${field.registro} - Campo ${field.campo} - ${field.descripcion}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="receipt-tag-filter">Filtro por tag</label>
                  <select
                    id="receipt-tag-filter"
                    value={receiptTagFilter}
                    onChange={(e) => setReceiptTagFilter(e.target.value)}
                  >
                    <option value="">Sin filtro</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                className="receipt-toolbar"
                style={{ marginTop: 8, borderTop: "1px dashed #d5deee", paddingTop: 10 }}
              >
                <div>
                  <label htmlFor="sim-legajo">Legajo (simulación)</label>
                  <select
                    id="sim-legajo"
                    value={simLegajoId}
                    onChange={(e) => setSimLegajoId(e.target.value)}
                    disabled={!simLegajosForConvenio.length}
                  >
                    {simLegajosForConvenio.length === 0 ? (
                      <option value="">Sin legajos para este convenio</option>
                    ) : (
                      simLegajosForConvenio.map((legajo) => (
                        <option key={legajo.id} value={legajo.id}>
                          {legajo.nroLegajo || "S/N"} - {legajo.nombre || "Sin nombre"}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="sim-month">Mes simulación</label>
                  <select
                    id="sim-month"
                    value={simMonth}
                    onChange={(e) => setSimMonth(Number(e.target.value))}
                  >
                    {simulationMonthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sim-year">Año simulación</label>
                  <input
                    id="sim-year"
                    type="number"
                    min={1970}
                    max={2200}
                    step={1}
                    value={simYear}
                    onChange={(e) => {
                      const parsedYear = Math.floor(Number(e.target.value || String(simYear)));
                      if (!Number.isFinite(parsedYear)) return;
                      setSimYear(Math.min(2200, Math.max(1970, parsedYear)));
                    }}
                  />
                </div>
              </div>
              <div className="panel-actions">
                <button className="add-button" onClick={addDefinitiveToReceipt}>
                  + Agregar concepto definitivo
                </button>
                <button
                  type="button"
                  className="save-inline-button"
                  onClick={() => setShowReceiptConceptDetail((prev) => !prev)}
                >
                  {showReceiptConceptDetail ? "Ocultar detalle" : "Mostrar detalle"}
                </button>
              </div>
              <ul className="concept-list">
                {definitivosEnReciboFiltrados.map((concept) => (
                  <li
                    key={concept.id}
                    draggable
                    onClick={() => setEditingId(concept.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copyMove";
                      e.dataTransfer.setData("text/plain", concept.code);
                      setCursorGhost(e, concept.code);
                      e.dataTransfer.setData("text/concept-id", String(concept.id));
                      e.dataTransfer.setData(
                        "text/token-json",
                        JSON.stringify(
                          token(
                            concept.code,
                            `CONCEPTO(${concept.id})`,
                            "concept"
                          )
                        )
                      );
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const dragId = Number(e.dataTransfer.getData("text/concept-id"));
                      reorderDefinitivo(dragId, concept.id);
                    }}
                    className={concept.id === selectedConcept.id ? "concept-item selected" : "concept-item"}
                  >
                    <div>
                      <span className="concept-marker" style={{ color: concept.color }}>
                        {getShapeGlyph(concept.shape)}
                      </span>
                      <strong>{concept.code}</strong> - {concept.name}
                      <span className="concept-type-inline">
                        {getConceptTypeDefinition(concept.conceptType).label}
                      </span>
                      {showReceiptConceptDetail ? (
                        <span className="concept-meta-inline">
                          {!hidePrecalculationPreview ? (
                            <>
                              {cycleConceptIds.has(concept.id) ? (
                                <span className="concept-error-inline">CICLO</span>
                              ) : null}
                              {formulaErrorById.get(concept.id) ? (
                                <span className="concept-error-inline">ERROR</span>
                              ) : null}
                              #{dagOrderById.get(concept.id) ?? "-"} ·{" "}
                              {formatPreviewAmount(previewValueById.get(concept.id) ?? 0)} ·{" "}
                            </>
                          ) : null}
                          {(concept.tags ?? []).map((tag) => `#${tag}`).join(" ")}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="panel-actions" style={{ marginTop: 12, borderTop: "1px dashed #d5deee", paddingTop: 10 }}>
                <button className="add-button" onClick={addTransitory}>
                  + Nuevo transitorio
                </button>
              </div>
              <ul className="concept-list">
                {transitoriosEnReciboFiltrados.map((concept) => (
                  <li
                    key={concept.id}
                    draggable
                    onClick={() => setEditingId(concept.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copyMove";
                      e.dataTransfer.setData("text/plain", concept.code);
                      setCursorGhost(e, concept.code);
                      e.dataTransfer.setData("text/concept-id", String(concept.id));
                      e.dataTransfer.setData(
                        "text/token-json",
                        JSON.stringify(
                          token(
                            concept.code,
                            `CCONCEPTO("${concept.code}")`,
                            "concept"
                          )
                        )
                      );
                    }}
                    className={
                      concept.id === selectedConcept.id
                        ? "concept-item transitorio-item selected"
                        : "concept-item transitorio-item"
                    }
                  >
                    <div>
                      <span className="concept-marker" style={{ color: concept.color }}>
                        {getShapeGlyph(concept.shape)}
                      </span>
                      <strong>{concept.code}</strong> - {concept.name}
                      <span className="concept-type-inline">
                        {getConceptTypeDefinition(concept.conceptType).label}
                      </span>
                      {showReceiptConceptDetail ? (
                        <span className="concept-meta-inline">
                          {!hidePrecalculationPreview ? (
                            <>
                              {cycleConceptIds.has(concept.id) ? (
                                <span className="concept-error-inline">CICLO</span>
                              ) : null}
                              {formulaErrorById.get(concept.id) ? (
                                <span className="concept-error-inline">ERROR</span>
                              ) : null}
                              #{dagOrderById.get(concept.id) ?? "-"} ·{" "}
                              {formatPreviewAmount(previewValueById.get(concept.id) ?? 0)} ·{" "}
                            </>
                          ) : null}
                          {(concept.tags ?? []).map((tag) => `#${tag}`).join(" ")}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="concept-header">
                <h2>Editor de Concepto</h2>
              </div>
              <div className="concept-subheader">
                <div className="concept-edit-inline">
                  <input
                    className="concept-inline-code-input"
                    value={conceptCodeDraft}
                    onChange={(e) => updateSelectedConceptCode(e.target.value)}
                    placeholder="Codigo"
                    title="Codigo del concepto"
                  />
                  <input
                    className="concept-inline-name-input"
                    value={conceptNameDraft}
                    onChange={(e) => updateSelectedConceptName(e.target.value)}
                    placeholder="Descripcion"
                    title="Descripcion del concepto"
                  />
                  <button
                    type="button"
                    className="remove-inline-button concept-delete-button"
                    onClick={deleteSelectedConcept}
                    title="Eliminar concepto"
                  >
                    🗑
                  </button>
                </div>
                <div className="appearance-selector" ref={appearanceRef}>
                  <button
                    className="appearance-trigger"
                    onClick={() => setAppearanceOpen((old) => !old)}
                    type="button"
                    title="Editar apariencia"
                  >
                    <span className="appearance-icon" style={{ color: selectedConcept.color }}>
                      {getShapeGlyph(selectedConcept.shape)}
                    </span>
                  </button>
                  {appearanceOpen && (
                    <div className="appearance-popover">
                      <div className="appearance-section">
                        <strong>Forma</strong>
                        <div className="shape-options">
                          {(
                            ["circle", "square", "star", "triangle", "diamond", "plus", "hex"] as ConceptShape[]
                          ).map((shape) => (
                            <button
                              key={shape}
                              type="button"
                              className={selectedConcept.shape === shape ? "shape-option active" : "shape-option"}
                              onClick={() => updateSelectedAppearance({ shape })}
                            >
                              {getShapeGlyph(shape)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="appearance-section">
                        <strong>Color</strong>
                        <div className="color-grid">
                          {colorPalette30.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={selectedConcept.color === color ? "color-swatch active" : "color-swatch"}
                              style={{ backgroundColor: color }}
                              onClick={() => updateSelectedAppearance({ color })}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="tags-editor">
                <div style={{ marginBottom: 10 }}>
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    <div style={{ position: "relative", minWidth: 0 }} ref={membershipTypeComboRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setMembershipTypeDropdownOpen((prev) => !prev);
                          setMembershipConvenioDropdownOpen(false);
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #c9d4ea",
                          background: "#fff",
                          cursor: "pointer"
                        }}
                      >
                        <span>Tipo de Liquidación</span>
                        <span>{membershipTypeDropdownOpen ? "▲" : "▼"}</span>
                      </button>
                      {membershipTypeDropdownOpen ? (
                        <div
                          style={{
                            position: "absolute",
                            top: "calc(100% + 4px)",
                            left: 0,
                            right: 0,
                            zIndex: 20,
                            maxHeight: 220,
                            overflow: "auto",
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #c9d4ea",
                            background: "#fff",
                            boxShadow: "0 8px 24px rgba(18, 30, 58, 0.15)"
                          }}
                        >
                          <ul className="concept-list">
                            {membershipLiquidationTypeOptions.map((liquidationType) => {
                              const rows = conceptReceiptMembership.filter(
                                (item) => item.liquidationType === liquidationType
                              );
                              const checked = rows.some((item) => item.belongs);
                              return (
                                <li key={`${selectedConcept.id}-liq-${liquidationType}`} className="concept-item">
                                  <label style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        setSelectedConceptMembershipByLiquidationType(
                                          liquidationType,
                                          e.target.checked
                                        )
                                      }
                                    />
                                    <span>{liquidationType}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <div style={{ position: "relative", minWidth: 0 }} ref={membershipConvenioComboRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setMembershipConvenioDropdownOpen((prev) => !prev);
                          setMembershipTypeDropdownOpen(false);
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #c9d4ea",
                          background: "#fff",
                          cursor: "pointer"
                        }}
                      >
                        <span>Convenio</span>
                        <span>{membershipConvenioDropdownOpen ? "▲" : "▼"}</span>
                      </button>
                      {membershipConvenioDropdownOpen ? (
                        <div
                          style={{
                            position: "absolute",
                            top: "calc(100% + 4px)",
                            left: 0,
                            right: 0,
                            zIndex: 20,
                            maxHeight: 220,
                            overflow: "auto",
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #c9d4ea",
                            background: "#fff",
                            boxShadow: "0 8px 24px rgba(18, 30, 58, 0.15)"
                          }}
                        >
                          <ul className="concept-list">
                            {membershipConvenioOptions.map((convenio) => {
                              const rows = conceptReceiptMembership.filter((item) => item.convenio === convenio);
                              const checked = rows.some((item) => item.belongs);
                              return (
                                <li key={`${selectedConcept.id}-conv-${convenio}`} className="concept-item">
                                  <label style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        setSelectedConceptMembershipByConvenio(convenio, e.target.checked)
                                      }
                                    />
                                    <span>{convenio}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <div style={{ position: "relative", minWidth: 0 }}>
                      <select
                        value={conceptTypeDraft}
                        onChange={(e) => updateSelectedConceptType(e.target.value as ConceptTypeId)}
                        title="Tipo de concepto"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #c9d4ea",
                          background: "#fff"
                        }}
                      >
                        {CONCEPT_TYPE_DEFINITIONS.map((definition) => (
                          <option key={definition.id} value={definition.id}>
                            {definition.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ position: "relative", minWidth: 0 }}>
                      <select
                        value={selectedConcept.f1359FieldId ?? ""}
                        onChange={(e) => updateSelectedConceptF1359Field(e.target.value)}
                        title="Campo F1359"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #c9d4ea",
                          background: "#fff"
                        }}
                      >
                        <option value="">Campo F1359 (sin asignar)</option>
                        {f1359Fields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {`Reg ${field.registro} - Campo ${field.campo} - ${field.descripcion}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="chip-wrap">
                  {selectedConcept.tags.map((tag) => {
                    const isImplicitTypeTag = implicitTypeTagValues.has(tag);
                    return (
                      <div key={tag} className={isImplicitTypeTag ? "tag-pill implicit-type-tag-pill" : "tag-pill"}>
                        <span>#{tag}</span>
                        {isImplicitTypeTag ? null : (
                          <button
                            className="tag-remove-inline"
                            onClick={() => removeTagFromSelectedConcept(tag)}
                            title="Quitar tag"
                          >
                            -
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <input
                    className="tag-input-pill"
                    value={newTagDraft}
                    onChange={(e) => handleTagDraftChange(e.target.value)}
                    placeholder="Nuevo tag"
                    list="existing-tags"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTagToSelectedConcept(newTagDraft);
                      }
                    }}
                  />
                  <datalist id="existing-tags">
                    {filteredTagSuggestions.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                </div>
              </div>
              <FormulaEditorSection
                tokens={selectedFormulaTokens}
                rootInsertSignal={rootInsertSignal}
                onInsertAt={insertFromRawTextAt}
                onDropToFormula={onTokenDropToFormula}
                onTriggerRootInsert={triggerRootInsert}
                renderRootToken={renderRootFormulaToken}
                formulaText={formulaExpressionText}
                onFormulaTextChange={setFormulaExpressionText}
                previewValue={previewInfo.value}
                previewError={previewInfo.error}
                hasCycle={cycleConceptIds.has(selectedConcept.id)}
                hidePreview={hidePrecalculationPreview}
              />
            </article>

            <FormulaToolsPanel
              allTags={allTags}
              fixedValueKeys={fixedValueKeys}
              insertAt={selectedFormulaTokens.length}
              onInsertBlockTemplate={insertBlockTemplateAt}
              onInsertConst={(index) =>
                insertTokenAt(token("const", buildConstExpression("0"), "function"), index)
              }
              onInsertAntiguedad={(index) =>
                insertTokenAt(token("Antigüedad", "ANTIGUEDAD()", "function"), index)
              }
              onInsertAnteriores={(index) =>
                insertTokenAt(token("Suma de Conceptos Previos del Recibo", "ANTERIORES()", "function"), index)
              }
              onInsertFixedValue={(key, index) =>
                insertTokenAt(token(`Valor Fijo ${key}`, `VALOR_FIJO("${key}")`, "function"), index)
              }
              onInsertMath={(op, index) => insertTokenAt(token(op, `MATH("${op}")`, "function"), index)}
              onOpenTagModal={(tag, insertAt) => setTagModal({ open: true, tag, insertAt })}
              setCursorGhost={setCursorGhost}
            />
          </section>
        )}
      </main>
      {tagModal.open && (
        <div className="modal-backdrop" onClick={() => setTagModal({ open: false, tag: "", insertAt: 0 })}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Operacion para tag #{tagModal.tag}</h3>
            <div className="modal-actions">
              <button onClick={() => applyTagAggregation("sum")}>Suma de...</button>
              <button onClick={() => applyTagAggregation("avg")}>Promedio de...</button>
              <button onClick={() => applyTagAggregation("max")}>Maximo de...</button>
              <button onClick={() => applyTagAggregation("min")}>Minimo de...</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
