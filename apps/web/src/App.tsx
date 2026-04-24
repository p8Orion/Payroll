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
  ConceptShape,
  ConceptModel,
  FormulaToken,
  LIQUIDATION_TYPES,
  LiquidationType,
  ReceiptModel,
  TagAggregationOp
} from "./model/types";

interface ApiConcept {
  id: number;
  code: string;
  name: string;
  conceptClass: "definitivo" | "transitorio";
  formula?: string;
  tags: string[];
}

const apiBaseUrl = "http://localhost:3001";
const receiptsStorageKey = "rrsh.receipts.v1";
const maxHistoryEntries = 200;
const defaultConvenios = ["Luz y Fuerza", "Apuaye", "Comercio"];
const virtualAllConvenio = "(Todos)";

interface EditorSnapshot {
  concepts: ConceptModel[];
  receipts: ReceiptModel[];
}

function receiptId(convenio: string, liquidationType: LiquidationType): string {
  return `${convenio}__${liquidationType}`;
}

function normalizeReceipt(
  receipt: Partial<ReceiptModel> & { id?: string; convenio?: string; name?: string; liquidationType?: string },
  fallbackOrder: number[]
): ReceiptModel | null {
  const convenio = (receipt.convenio ?? "").trim();
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
  const [receipts, setReceipts] = useState<ReceiptModel[]>(() => {
    const fallbackOrder = initialConcepts
      .filter((c) => c.conceptClass === "definitivo")
      .map((c) => c.id);
    if (typeof window === "undefined") return initialReceipts;
    try {
      const raw = window.localStorage.getItem(receiptsStorageKey);
      if (!raw) {
        return ensureReceiptMatrix(initialReceipts, defaultConvenios, fallbackOrder);
      }
      const parsed = JSON.parse(raw) as ReceiptModel[];
      const base = parsed.length ? parsed : initialReceipts;
      return ensureReceiptMatrix(base, defaultConvenios, fallbackOrder);
    } catch {
      return ensureReceiptMatrix(initialReceipts, defaultConvenios, fallbackOrder);
    }
  });
  const [activeReceiptId, setActiveReceiptId] = useState("");
  const [activeConvenio, setActiveConvenio] = useState("Luz y Fuerza");
  const [convenioOptions, setConvenioOptions] = useState<string[]>(defaultConvenios);
  const [legajos, setLegajos] = useState<LegajoModel[]>(() => {
    return [];
  });
  const [composiciones, setComposiciones] = useState<ComposicionSalarialModel[]>([]);
  const [simLegajoId, setSimLegajoId] = useState<string>("");
  const [newTagDraft, setNewTagDraft] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [conceptEditOpen, setConceptEditOpen] = useState(false);
  const [conceptCodeDraft, setConceptCodeDraft] = useState("");
  const [conceptNameDraft, setConceptNameDraft] = useState("");
  const [conceptsLoaded, setConceptsLoaded] = useState(false);
  const [legajosLoaded, setLegajosLoaded] = useState(false);
  const appearanceRef = useRef<HTMLDivElement | null>(null);
  const liquidacionesMenuRef = useRef<HTMLDivElement | null>(null);
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
          virtualAllConvenio,
          ...convenioOptions,
          ...receipts.map((r) => r.convenio),
          activeConvenio
        ])
      ),
    [receipts, convenioOptions, activeConvenio]
  );
  const receiptsByConvenio = receipts.filter((r) => r.convenio === activeConvenio);
  const allTags = [...new Set(concepts.flatMap((c) => c.tags))];
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
  const filteredTagSuggestions = allTags.filter((tag) =>
    tag.toLowerCase().includes(newTagDraft.trim().toLowerCase())
  );
  const [editingId, setEditingId] = useState<number>(definitivos[0].id);
  const activeReceipt = receipts.find((r) => r.id === activeReceiptId) ?? receiptsByConvenio[0] ?? receipts[0];
  const definitivosEnRecibo = activeReceipt.definitiveOrder
    .map((id) => concepts.find((c) => c.id === id))
    .filter((c): c is ConceptModel => Boolean(c));
  const transitoriosEnRecibo = activeReceipt.transitoryOrder
    .map((id) => concepts.find((c) => c.id === id))
    .filter((c): c is ConceptModel => Boolean(c));

  const selectedConcept = concepts.find((c) => c.id === editingId) ?? concepts[0];
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
      (activeConvenio ?? "").trim() === virtualAllConvenio
        ? legajos
        : legajos.filter((l) => (l.convenio ?? "").trim() === (activeConvenio ?? "").trim()),
    [legajos, activeConvenio]
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
  const formatPreviewAmount = (value: unknown): string =>
    typeof value === "number" ? `$${value.toLocaleString("es-AR")}` : String(value);
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
    setCursorGhost
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
              const asNumber = Number(value);
              if (!Number.isNaN(asNumber) && value.trim() !== "") return String(asNumber);
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
          values.set(id, result);
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
  }, [editingId, selectedConcept, participatingConcepts, simLegajo, simLegajoId]);
  const dagOrderById = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
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
  }, [participatingConcepts, simLegajo, simLegajoId]);
  const cycleConceptIds = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
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
  }, [participatingConcepts, simLegajo, simLegajoId]);
  const formulaErrorById = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
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
            const asNumber = Number(value);
            if (!Number.isNaN(asNumber) && value.trim() !== "") return String(asNumber);
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
        values.set(id, result);
        errors.set(id, false);
      } catch {
        values.set(id, 0);
        errors.set(id, true);
      }
    }

    return errors;
  }, [participatingConcepts, simLegajo, simLegajoId]);
  const previewValueById = useMemo(() => {
    const conceptById = new Map(participatingConcepts.map((c) => [c.id, c]));
    const conceptIdByCode = new Map(participatingConcepts.map((c) => [c.code, c.id]));
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
            const asNumber = Number(value);
            if (!Number.isNaN(asNumber) && value.trim() !== "") return String(asNumber);
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
        values.set(id, result);
      } catch {
        values.set(id, 0);
      }
    }

    return values;
  }, [participatingConcepts, simLegajo, simLegajoId]);

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
      color: colorPalette30[(newId - 1) % colorPalette30.length],
      shape: shapeCycle[(newId - 1) % shapeCycle.length],
      tags: [],
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
      color: colorPalette30[(newId - 1) % colorPalette30.length],
      shape: shapeCycle[(newId - 1) % shapeCycle.length],
      tags: [],
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

  const addTagToSelectedConcept = (tagInput: string) => {
    const normalized = tagInput.trim().toLowerCase();
    if (!normalized) return;
    setConcepts((prev) =>
      prev.map((c) => {
        if (c.id !== selectedConcept.id) return c;
        if (c.tags.includes(normalized)) return c;
        return { ...c, tags: [...c.tags, normalized] };
      })
    );
    setNewTagDraft("");
  };

  const startConceptEdit = () => {
    setConceptCodeDraft(selectedConcept.code);
    setConceptNameDraft(selectedConcept.name);
    setConceptEditOpen(true);
  };

  const saveConceptEdit = () => {
    const nextCode = conceptCodeDraft.trim();
    const nextName = conceptNameDraft.trim();
    if (!nextCode || !nextName) return;
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id ? { ...c, code: nextCode.toUpperCase(), name: nextName } : c
      )
    );
    setConceptEditOpen(false);
  };

  const deleteSelectedConcept = () => {
    if (concepts.length <= 1) return;
    const removingId = selectedConcept.id;
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
    setConceptEditOpen(false);
  };

  const updateSelectedAppearance = (patch: Partial<Pick<ConceptModel, "shape" | "color">>) => {
    setConcepts((prev) =>
      prev.map((c) => (c.id === selectedConcept.id ? { ...c, ...patch } : c))
    );
  };

  const removeTagFromSelectedConcept = (tagToRemove: string) => {
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, tags: c.tags.filter((tag) => tag !== tagToRemove) }
          : c
      )
    );
  };

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
    if (!conceptsLoaded) return;
    const timeout = setTimeout(() => {
      void Promise.allSettled(concepts.map((concept) => persistConcept(concept)));
    }, 250);
    return () => clearTimeout(timeout);
  }, [concepts, conceptsLoaded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(receiptsStorageKey, JSON.stringify(receipts));
  }, [receipts]);

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
    const active = receipts.find((r) => r.id === activeReceiptId);
    if (active) {
      if (activeConvenio !== active.convenio) setActiveConvenio(active.convenio);
      return;
    }
    const firstForConvenio = receipts.find((r) => r.convenio === activeConvenio);
    if (firstForConvenio) {
      setActiveReceiptId(firstForConvenio.id);
      return;
    }
    setActiveReceiptId(receipts[0].id);
  }, [receipts, activeReceiptId, activeConvenio]);

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
        <h1>RRSH Payroll</h1>
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
                    value={activeConvenio}
                    onChange={(e) => {
                      const convenio = e.target.value;
                      setActiveConvenio(convenio);
                      const nextReceipt = receipts.find((r) => r.convenio === convenio);
                      if (nextReceipt) setActiveReceiptId(nextReceipt.id);
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
                    value={activeReceiptId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setActiveReceiptId(nextId);
                      const next = receipts.find((r) => r.id === nextId);
                      if (next) setActiveConvenio(next.convenio);
                    }}
                  >
                    {receiptsByConvenio.map((receipt) => (
                      <option key={receipt.id} value={receipt.id}>
                        {receipt.liquidationType}
                      </option>
                    ))}
                  </select>
                </div>
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
              </div>
              <div className="panel-actions">
                <button className="add-button" onClick={addDefinitiveToReceipt}>
                  + Agregar concepto definitivo
                </button>
              </div>
              <ul className="concept-list">
                {definitivosEnRecibo.map((concept) => (
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
                      <span className="concept-meta-inline">
                        {cycleConceptIds.has(concept.id) ? (
                          <span className="concept-error-inline">CICLO</span>
                        ) : null}
                        {formulaErrorById.get(concept.id) ? (
                          <span className="concept-error-inline">ERROR</span>
                        ) : null}
                        #{dagOrderById.get(concept.id) ?? "-"} ·{" "}
                        {formatPreviewAmount(previewValueById.get(concept.id) ?? 0)} ·{" "}
                        {(concept.tags ?? []).map((tag) => `#${tag}`).join(" ")}
                      </span>
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
                {transitoriosEnRecibo.map((concept) => (
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
                      <span className="concept-meta-inline">
                        {cycleConceptIds.has(concept.id) ? (
                          <span className="concept-error-inline">CICLO</span>
                        ) : null}
                        {formulaErrorById.get(concept.id) ? (
                          <span className="concept-error-inline">ERROR</span>
                        ) : null}
                        #{dagOrderById.get(concept.id) ?? "-"} ·{" "}
                        {formatPreviewAmount(previewValueById.get(concept.id) ?? 0)} ·{" "}
                        {(concept.tags ?? []).map((tag) => `#${tag}`).join(" ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="concept-header">
                <h2>Editor de concepto</h2>
              </div>
              <div className="concept-subheader">
                {conceptEditOpen ? (
                  <div className="concept-edit-inline">
                    <input
                      value={conceptCodeDraft}
                      onChange={(e) => setConceptCodeDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveConceptEdit();
                        if (e.key === "Escape") setConceptEditOpen(false);
                      }}
                      placeholder="Codigo"
                    />
                    <input
                      value={conceptNameDraft}
                      onChange={(e) => setConceptNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveConceptEdit();
                        if (e.key === "Escape") setConceptEditOpen(false);
                      }}
                      placeholder="Descripcion"
                    />
                    <button type="button" className="save-inline-button" onClick={saveConceptEdit} title="Guardar">
                      💾
                    </button>
                    <button
                      type="button"
                      className="remove-inline-button"
                      onClick={deleteSelectedConcept}
                      title="Eliminar concepto"
                    >
                      -
                    </button>
                  </div>
                ) : (
                  <h3
                    className="concept-edit-trigger"
                    onClick={startConceptEdit}
                    title="Click para editar codigo y descripcion"
                  >
                    {selectedConcept.code} - {selectedConcept.name} ({selectedConcept.conceptClass}).
                  </h3>
                )}
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
                <div className="chip-wrap">
                  {selectedConcept.tags.map((tag) => (
                    <div key={tag} className="tag-pill">
                      <span>#{tag}</span>
                      <button
                        className="tag-remove-inline"
                        onClick={() => removeTagFromSelectedConcept(tag)}
                        title="Quitar tag"
                      >
                        -
                      </button>
                    </div>
                  ))}
                  <input
                    className="tag-input-pill"
                    value={newTagDraft}
                    onChange={(e) => setNewTagDraft(e.target.value)}
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
