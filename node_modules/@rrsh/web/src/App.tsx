import { CSSProperties, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { FormulaInlineEditor } from "./components/FormulaInlineEditor";
import { colorPalette30, shapeCycle } from "./model/constants";
import {
  formulaToExpression,
  getShapeGlyph,
  token,
  tokenizeFormulaExpression
} from "./model/helpers";
import {
  expandBracketBlocksToExpressions,
  functionBlockTemplates,
  normalizeExcelComparators,
  normalizeExcelIf,
  parseFunctionBlock,
  serializeFunctionBlock,
  type FunctionBlockModel
} from "./model/function-blocks";
import { initialConcepts, initialReceipts } from "./model/seed";
import { ConceptShape, ConceptModel, FormulaToken, ReceiptModel, TagAggregationOp } from "./model/types";

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

function toApiConcept(concept: ConceptModel): ApiConcept {
  return {
    id: concept.id,
    code: concept.code,
    name: concept.name,
    conceptClass: concept.conceptClass,
    formula: formulaToExpression(concept.formulaTokens ?? []),
    tags: concept.tags
  };
}

function isConstExpression(expr: string): boolean {
  return /^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/.test(expr.trim());
}

function parseConstValue(expr: string): string {
  const m = expr.trim().match(/^CONSTANTE\("((?:[^"\\]|\\.)*)"\)$/);
  if (!m) return "";
  return m[1].replace(/\\"/g, "\"");
}

function buildConstExpression(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `CONSTANTE("${escaped}")`;
}

function isMathOperatorText(value: string): boolean {
  return ["+", "-", "*", "/", "(", ")", "[", "]", "%", ">", "<", ">=", "<=", "=", "<>"].includes(
    value.trim()
  );
}

function isMathExpression(expr: string): boolean {
  return /^MATH\("((?:[^"\\]|\\.)*)"\)$/.test(expr.trim());
}

function isTagAggregationExpression(expr: string): boolean {
  const value = expr.trim();
  return /^SUM_TAG\("([^"]+)"\)$/.test(value) || /^TAG_OP\("(sum|avg|max|min)","([^"]+)"\)$/.test(value);
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
    formulaTokens: concept.formula
      ? tokenizeFormulaExpression(concept.formula, { conceptCodeById })
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
  const [menu, setMenu] = useState("modelo");
  const [concepts, setConcepts] = useState<ConceptModel[]>(initialConcepts);
  const [receipts, setReceipts] = useState<ReceiptModel[]>(() => {
    if (typeof window === "undefined") return initialReceipts;
    try {
      const raw = window.localStorage.getItem(receiptsStorageKey);
      if (!raw) return initialReceipts;
      const parsed = JSON.parse(raw) as ReceiptModel[];
      return parsed.length ? parsed : initialReceipts;
    } catch {
      return initialReceipts;
    }
  });
  const [activeReceiptId, setActiveReceiptId] = useState("recibo_1");
  const [activeConvenio, setActiveConvenio] = useState("Luz y Fuerza");
  const [newTagDraft, setNewTagDraft] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const [draggingFormulaTokenId, setDraggingFormulaTokenId] = useState<string | null>(null);
  const [editingTextTokenId, setEditingTextTokenId] = useState<string | null>(null);
  const [editingTextDraft, setEditingTextDraft] = useState("");
  const [editingConstTokenId, setEditingConstTokenId] = useState<string | null>(null);
  const [editingConstDraft, setEditingConstDraft] = useState("");
  const [conceptEditOpen, setConceptEditOpen] = useState(false);
  const [conceptCodeDraft, setConceptCodeDraft] = useState("");
  const [conceptNameDraft, setConceptNameDraft] = useState("");
  const [conceptsLoaded, setConceptsLoaded] = useState(false);
  const appearanceRef = useRef<HTMLDivElement | null>(null);
  const textTokenEditRef = useRef<HTMLDivElement | null>(null);
  const [tagModal, setTagModal] = useState<{
    open: boolean;
    tag: string;
    insertAt: number;
  }>({ open: false, tag: "", insertAt: 0 });
  const [rootInsertSignal, setRootInsertSignal] = useState<number | undefined>(undefined);
  const isInlineEditing = Boolean(editingTextTokenId || editingConstTokenId);

  const scopePastelStyle = (functionName: string, level: number): CSSProperties => {
    const normalized = functionName.trim().toUpperCase() || "FN";
    const hash = Array.from(normalized).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const hue = (hash * 37) % 360;
    const depth = Math.max(0, level);
    const bgLightness = Math.max(80, 96 - depth * 4);
    const borderLightness = Math.max(68, 84 - depth * 4);
    return {
      background: `hsl(${hue} 58% ${bgLightness}%)`,
      borderColor: `hsl(${hue} 36% ${borderLightness}%)`
    };
  };

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

  const saveConstAtRoot = (tokenId: string) => {
    const value = editingConstDraft.trim();
    if (!value) {
      updateFormulaTokens(selectedConcept.formulaTokens.filter((item) => item.id !== tokenId));
    } else {
      updateFormulaTokens(
        selectedConcept.formulaTokens.map((item) =>
          item.id === tokenId
            ? { ...item, label: value, expression: buildConstExpression(value) }
            : item
        )
      );
    }
    setEditingConstTokenId(null);
    setEditingConstDraft("");
  };

  const definitivos = concepts.filter((c) => c.conceptClass === "definitivo");
  const transitorios = concepts.filter((c) => c.conceptClass === "transitorio");
  const receiptsByConvenio = receipts.filter((r) => r.convenio === activeConvenio);
  const allTags = [...new Set(concepts.flatMap((c) => c.tags))];
  const filteredTagSuggestions = allTags.filter((tag) =>
    tag.toLowerCase().includes(newTagDraft.trim().toLowerCase())
  );
  const [editingId, setEditingId] = useState<number>(definitivos[0].id);
  const activeReceipt = receipts.find((r) => r.id === activeReceiptId) ?? receiptsByConvenio[0] ?? receipts[0];
  const definitivosEnRecibo = activeReceipt.definitiveOrder
    .map((id) => concepts.find((c) => c.id === id))
    .filter((c): c is ConceptModel => Boolean(c));

  const selectedConcept = concepts.find((c) => c.id === editingId) ?? concepts[0];
  const conceptCodeById = useMemo(
    () => Object.fromEntries(concepts.map((c) => [c.id, c.code])) as Record<number, string>,
    [concepts]
  );
  const participatingConcepts = useMemo(() => {
    const inReceipt = new Set(activeReceipt.definitiveOrder);
    const result = concepts.filter(
      (c) => c.conceptClass === "transitorio" || inReceipt.has(c.id)
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
      const expression = formulaToExpression(concept.formulaTokens ?? []);
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
    const values = new Map<number, number>();

    try {
      for (const id of topo) {
        const concept = conceptById.get(id);
        if (!concept) continue;
        const expression = formulaToExpression(concept.formulaTokens ?? []);
        if (!expression.trim()) {
          values.set(id, 0);
          continue;
        }

        try {
          const normalized = expandBracketBlocksToExpressions(expression)
            .replace(/CONCEPTO\((\d+)\)/g, (_, refId: string) => {
              const value = values.get(Number(refId));
              if (value === undefined) throw new Error("missing CONCEPTO dep");
              return String(value);
            })
            .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, refCode: string) => {
              const refId = conceptIdByCode.get(refCode);
              if (!refId) throw new Error("missing CCONCEPTO code");
              const value = values.get(refId);
              if (value === undefined) throw new Error("missing CCONCEPTO dep");
              return String(value);
            })
            .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
              const sum = participatingConcepts
                .filter((c) => c.tags.includes(tag))
                .reduce((acc, c) => acc + (values.get(c.id) ?? 0), 0);
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
                .map((c) => values.get(c.id) ?? 0);
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

          const excelLike = normalizeExcelComparators(normalizeExcelIf(normalized));
          let result: unknown;
          result = Function(
            `"use strict"; const IF = (cond, v, f) => (cond ? v : f); return (${excelLike});`
          )();
          if (typeof result !== "number" || Number.isNaN(result)) {
            throw new Error("invalid result");
          }
          values.set(id, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "error de compilacion";
          const compiled = normalizeExcelComparators(
            normalizeExcelIf(
              expandBracketBlocksToExpressions(expression)
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
        value: null as number | null,
        error: message
      };
    }
  }, [editingId, selectedConcept, participatingConcepts]);
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
      const expression = formulaToExpression(concept.formulaTokens ?? []);
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
  }, [participatingConcepts]);
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
      const expression = formulaToExpression(concept.formulaTokens ?? []);
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
  }, [participatingConcepts]);
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
      const expression = formulaToExpression(concept.formulaTokens ?? []);
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

    const values = new Map<number, number>();
    const errors = new Map<number, boolean>();
    const params: Record<string, number> = { porc_antiguedad: 0.12 };

    for (const id of topo) {
      const concept = conceptById.get(id);
      if (!concept) continue;
      const expression = formulaToExpression(concept.formulaTokens ?? []);
      if (!expression.trim()) {
        values.set(id, 0);
        errors.set(id, false);
        continue;
      }

      try {
        const normalized = expandBracketBlocksToExpressions(expression)
          .replace(/CONCEPTO\((\d+)\)/g, (_, refId: string) => {
            const value = values.get(Number(refId));
            if (value === undefined) throw new Error("missing CONCEPTO dep");
            return String(value);
          })
          .replace(/CCONCEPTO\("([^"]+)"\)/g, (_, refCode: string) => {
            const refId = conceptIdByCode.get(refCode);
            if (!refId) throw new Error("missing CCONCEPTO code");
            const value = values.get(refId);
            if (value === undefined) throw new Error("missing CCONCEPTO dep");
            return String(value);
          })
          .replace(/SUM_TAG\("([^"]+)"\)/g, (_, tag: string) => {
            const sum = participatingConcepts
              .filter((c) => c.tags.includes(tag))
              .reduce((acc, c) => acc + (values.get(c.id) ?? 0), 0);
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
              .map((c) => values.get(c.id) ?? 0);
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

        const excelLike = normalizeExcelComparators(normalizeExcelIf(normalized));
        const result = Function(
          `"use strict"; const IF = (cond, v, f) => (cond ? v : f); return (${excelLike});`
        )();
        if (typeof result !== "number" || Number.isNaN(result)) {
          throw new Error("invalid result");
        }
        values.set(id, result);
        errors.set(id, false);
      } catch {
        values.set(id, 0);
        errors.set(id, true);
      }
    }

    return errors;
  }, [participatingConcepts]);

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

  const updateFormulaTokens = (tokens: FormulaToken[]) => {
    setConcepts((old) =>
      old.map((c) => (c.id === selectedConcept.id ? { ...c, formulaTokens: tokens } : c))
    );
  };

  const insertToken = (newToken: FormulaToken) => {
    updateFormulaTokens([
      ...(selectedConcept.formulaTokens ?? []),
      token(newToken.label, newToken.expression, newToken.kind)
    ]);
  };

  const insertTokenAt = (newToken: FormulaToken, index: number) => {
    const current = [...(selectedConcept.formulaTokens ?? [])];
    current.splice(index, 0, token(newToken.label, newToken.expression, newToken.kind));
    updateFormulaTokens(current);
  };

  const insertFromRawTextAt = (rawValue: string, index: number) => {
    const value = rawValue.trim();
    if (!value) return;
    if (isMathOperatorText(value)) {
      insertTokenAt(token(value, `MATH("${value}")`, "function"), index);
      return;
    }
    insertTokenAt(token(value, buildConstExpression(value), "function"), index);
  };

  const insertIfTemplateAt = (index: number) => {
    const current = [...(selectedConcept.formulaTokens ?? [])];
    const expr = serializeFunctionBlock("SI", ["", "", ""]);
    current.splice(index, 0, token("SI", expr, "block"));
    updateFormulaTokens(current);
  };

  const slotSuffixFor = (slotExpression: string): ";" | ")" =>
    slotExpression.trim().endsWith(")") ? ")" : ";";

  const stripSlotSuffix = (expression: string): string => {
    const value = expression.trim();
    if (!value) return value;
    if (value.endsWith(";")) return value.slice(0, -1);
    if (!value.endsWith(")")) return value;

    const opens = (value.match(/\(/g) ?? []).length;
    const closes = (value.match(/\)/g) ?? []).length;
    // For SI slot storage we append an extra ')' only when closes > opens.
    if (closes > opens) return value.slice(0, -1);
    return value;
  };

  const slotRoleAt = (index: number): "cond" | "true" | "false" | null => {
    const tokens = selectedConcept.formulaTokens ?? [];
    if (tokens[index]?.kind !== "slot") return null;
    const prev = tokens[index - 1];
    const prev2 = tokens[index - 2];
    const prev3 = tokens[index - 3];
    if (prev?.kind === "function" && prev.label === "SI") return "cond";
    if (prev?.kind === "slot" && prev2?.kind === "function" && prev2.label === "SI") return "true";
    if (
      prev?.kind === "slot" &&
      prev2?.kind === "slot" &&
      prev3?.kind === "function" &&
      prev3.label === "SI"
    ) {
      return "false";
    }
    return null;
  };

  const isSiBlockStartAt = (index: number): boolean => {
    const tokens = selectedConcept.formulaTokens ?? [];
    const template = functionBlockTemplates.SI;
    return (
      tokens[index]?.kind === "function" &&
      tokens[index]?.label === "SI" &&
      tokens[index + 1]?.kind === "slot" &&
      tokens[index + 1]?.label === template.branches[0] &&
      tokens[index + 2]?.kind === "slot" &&
      tokens[index + 2]?.label === template.branches[1] &&
      tokens[index + 3]?.kind === "slot" &&
      tokens[index + 3]?.label === template.branches[2]
    );
  };

  const isSiBlockChildSlotAt = (index: number): boolean => {
    const tokens = selectedConcept.formulaTokens ?? [];
    for (let back = 1; back <= 3; back++) {
      const start = index - back;
      if (start < 0) continue;
      if (isSiBlockStartAt(start) && tokens[index]?.kind === "slot") return true;
    }
    return false;
  };

  const renderSlotContent = (rawExpression: string): ReactNode => {
    const content = stripSlotSuffix(rawExpression).trim();
    if (!content) return <em>vacio</em>;
    const parsed = tokenizeFormulaExpression(content, { conceptCodeById });
    return (
      <>
        {parsed.map((part) =>
          part.kind === "text" ? (
            <span key={part.id} className="slot-fragment-text">
              {part.label}
            </span>
          ) : (
            <span key={part.id} className={`slot-fragment-pill ${part.kind}`}>
              {part.label}
            </span>
          )
        )}
      </>
    );
  };

  const replaceSlotWithDroppedToken = (event: DragEvent<HTMLElement>, slotId: string) => {
    event.preventDefault();
    event.stopPropagation();

    const current = [...(selectedConcept.formulaTokens ?? [])];
    const slotIndex = current.findIndex((item) => item.id === slotId);
    if (slotIndex === -1) return;

    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    if (internalTokenId) {
      const fromIndex = current.findIndex((item) => item.id === internalTokenId);
      if (fromIndex !== -1) {
        const source = current[fromIndex];
        const sourceExpr =
          source.kind === "slot"
            ? stripSlotSuffix(source.expression).trim()
            : source.expression.trim();

        const targetExpr = stripSlotSuffix(current[slotIndex].expression).trim();
        const targetSuffix = slotSuffixFor(current[slotIndex].expression);
        const merged = [targetExpr, sourceExpr].filter(Boolean).join(" ");

        current[slotIndex] = token(current[slotIndex].label, `${merged}${targetSuffix}`, "slot");

        // Keep SI block structure stable: never replace slot tokens.
        // If source was a slot, clear it but keep slot delimiters.
        if (source.kind === "slot") {
          const sourceSuffix = slotSuffixFor(source.expression);
          current[fromIndex] = token(source.label, sourceSuffix, "slot");
        } else {
          current.splice(fromIndex, 1);
        }
        updateFormulaTokens(current);
      }
      setDragInsertIndex(null);
      setDraggingFormulaTokenId(null);
      return;
    }

    const payload = event.dataTransfer.getData("text/token-json");
    if (payload) {
      const parsed = JSON.parse(payload) as FormulaToken;
      const suffix = slotSuffixFor(current[slotIndex].expression);
      const base = stripSlotSuffix(current[slotIndex].expression).trim();
      const nextChunk = parsed.expression.trim();
      const merged = [base, nextChunk].filter(Boolean).join(" ");
      current.splice(
        slotIndex,
        1,
        token(current[slotIndex].label, `${merged}${suffix}`, "slot")
      );
      updateFormulaTokens(current);
      setDragInsertIndex(null);
      return;
    }

    const ifTemplate = event.dataTransfer.getData("text/function-template");
    if (ifTemplate === "SI") {
      const suffix = slotSuffixFor(current[slotIndex].expression);
      const base = stripSlotSuffix(current[slotIndex].expression).trim();
      const appended = `${base}${base ? " " : ""}SI(condicion;0;0)`;
      current.splice(
        slotIndex,
        1,
                        token(current[slotIndex].label, `${appended}${suffix}`, "slot")
      );
      updateFormulaTokens(current);
      setDragInsertIndex(null);
    }
  };

  const updateBlockArg = (blockId: string, argIndex: number, nextValue: string) => {
    updateFormulaTokens(
      selectedConcept.formulaTokens.map((tk) => {
        if (tk.id !== blockId || tk.kind !== "block") return tk;
        const parsed = parseFunctionBlock(tk.expression);
        if (!parsed) return tk;
        const nextArgs = [...parsed.args];
        while (nextArgs.length < 3) nextArgs.push("");
        nextArgs[argIndex] = nextValue.trim();
        return { ...tk, expression: serializeFunctionBlock(parsed.name, nextArgs) };
      })
    );
  };

  const onDropToBlockArg = (event: DragEvent<HTMLElement>, blockId: string, argIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    let droppedExpression = "";

    if (internalTokenId) {
      const source = selectedConcept.formulaTokens.find((tk) => tk.id === internalTokenId);
      if (source) droppedExpression = source.expression.trim();
    } else {
      const payload = event.dataTransfer.getData("text/token-json");
      if (payload) {
        const parsed = JSON.parse(payload) as FormulaToken;
        droppedExpression = parsed.expression.trim();
      } else {
        const fnTemplate = event.dataTransfer.getData("text/function-template");
        if (fnTemplate === "SI") droppedExpression = serializeFunctionBlock("SI", ["", "", ""]);
      }
    }

    if (!droppedExpression) return;

    updateFormulaTokens(
      selectedConcept.formulaTokens
        .filter((tk) => tk.id !== internalTokenId)
        .map((tk) => {
          if (tk.id !== blockId || tk.kind !== "block") return tk;
          const parsedBlock = parseFunctionBlock(tk.expression);
          if (!parsedBlock) return tk;
          const nextArgs = [...parsedBlock.args];
          while (nextArgs.length < 3) nextArgs.push("");
          nextArgs[argIndex] = [nextArgs[argIndex] ?? "", droppedExpression].filter(Boolean).join(" ");
          return { ...tk, expression: serializeFunctionBlock(parsedBlock.name, nextArgs) };
        })
    );
    setDragInsertIndex(null);
    setDraggingFormulaTokenId(null);
  };

  const updateBlockArgTokens = (
    blockId: string,
    argIndex: number,
    updater: (tokens: FormulaToken[]) => FormulaToken[]
  ) => {
    updateFormulaTokens(
      selectedConcept.formulaTokens.map((tk) => {
        if (tk.id !== blockId || tk.kind !== "block") return tk;
        const parsedBlock = parseFunctionBlock(tk.expression);
        if (!parsedBlock) return tk;
        const nextArgs = [...parsedBlock.args];
        while (nextArgs.length < 3) nextArgs.push("");
    const currentTokens = tokenizeFormulaExpression(nextArgs[argIndex] ?? "", { conceptCodeById });
        const nextTokens = updater(currentTokens);
        nextArgs[argIndex] = formulaToExpression(nextTokens);
        return { ...tk, expression: serializeFunctionBlock(parsedBlock.name, nextArgs) };
      })
    );
  };

  const mutateBlockArgTokens = (
    blockExpr: string,
    argIndex: number,
    updater: (tokens: FormulaToken[]) => FormulaToken[]
  ): string => {
    const parsed = parseFunctionBlock(blockExpr);
    if (!parsed) return blockExpr;
    const nextArgs = [...parsed.args];
    while (nextArgs.length < 3) nextArgs.push("");
    const tokens = tokenizeFormulaExpression(nextArgs[argIndex] ?? "");
    nextArgs[argIndex] = formulaToExpression(updater(tokens));
    return serializeFunctionBlock(parsed.name, nextArgs);
  };

  const insertRawTextIntoNestedArg = (
    blockExpr: string,
    onChange: (next: string) => void,
    argIndex: number,
    insertAt: number,
    rawValue: string
  ) => {
    const value = rawValue.trim();
    if (!value) return;
    onChange(
      mutateBlockArgTokens(blockExpr, argIndex, (tokens) => {
        const next = [...tokens];
        const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
        if (isMathOperatorText(value)) {
          next.splice(safeInsertAt, 0, token(value, `MATH("${value}")`, "function"));
        } else {
          next.splice(safeInsertAt, 0, token(value, buildConstExpression(value), "function"));
        }
        return next;
      })
    );
  };

  const onDropToNestedArgAt = (
    event: DragEvent<HTMLElement>,
    blockExpr: string,
    onChange: (next: string) => void,
    pathKey: string,
    argIndex: number,
    insertAt: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (isInlineEditing) return;

    const localPayload = event.dataTransfer.getData("text/block-local-token-json");
    if (localPayload) {
      const parsed = JSON.parse(localPayload) as {
        pathKey: string;
        argIndex: number;
        tokenIndex: number;
        token: FormulaToken;
      };
      const nextExpr = mutateBlockArgTokens(blockExpr, argIndex, (tokens) => {
        const next = [...tokens];
        if (parsed.pathKey === pathKey && parsed.argIndex === argIndex) {
          const [moved] = next.splice(parsed.tokenIndex, 1);
          const adjusted = parsed.tokenIndex < insertAt ? insertAt - 1 : insertAt;
          next.splice(Math.max(0, Math.min(adjusted, next.length)), 0, moved);
          return next;
        }
        const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
        next.splice(
          safeInsertAt,
          0,
          token(parsed.token.label, parsed.token.expression, parsed.token.kind)
        );
        return next;
      });
      onChange(nextExpr);
      return;
    }

    const payload = event.dataTransfer.getData("text/token-json");
    if (payload) {
      const parsed = JSON.parse(payload) as FormulaToken;
      const nextExpr = mutateBlockArgTokens(blockExpr, argIndex, (tokens) => {
        const next = [...tokens];
        const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
        next.splice(safeInsertAt, 0, token(parsed.label, parsed.expression, parsed.kind));
        return next;
      });
      onChange(nextExpr);
      return;
    }

    const fnTemplate = event.dataTransfer.getData("text/function-template");
    if (fnTemplate === "SI" || fnTemplate === "CONSTANTE" || fnTemplate.startsWith("MATH:")) {
      const nextExpr = mutateBlockArgTokens(blockExpr, argIndex, (tokens) => {
        const next = [...tokens];
        const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
        if (fnTemplate === "SI") {
          next.splice(
            safeInsertAt,
            0,
            token("SI", serializeFunctionBlock("SI", ["", "", ""]), "block")
          );
        } else if (fnTemplate === "CONSTANTE") {
          next.splice(safeInsertAt, 0, token("const", buildConstExpression("0"), "function"));
        } else {
          const op = fnTemplate.slice("MATH:".length);
          next.splice(safeInsertAt, 0, token(op, `MATH("${op}")`, "function"));
        }
        return next;
      });
      onChange(nextExpr);
      return;
    }

    const resolved = resolveDroppedExpression(event);
    if (!resolved) return;
    const nextExpr = mutateBlockArgTokens(blockExpr, argIndex, (tokens) => {
      const next = [...tokens];
      const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
      next.splice(safeInsertAt, 0, token(resolved, resolved, "text"));
      return next;
    });
    onChange(nextExpr);
  };

  const renderFunctionBlockEditor = (
    blockExpr: string,
    onChange: (next: string) => void,
    pathKey: string,
    level: number,
    onRemove?: () => void
  ): ReactNode => {
    const parsed = parseFunctionBlock(blockExpr);
    if (!parsed) return <span className="formula-text">{blockExpr}</span>;
    const labels =
      parsed.name in functionBlockTemplates
        ? functionBlockTemplates[parsed.name as keyof typeof functionBlockTemplates].branches
        : (["ARG 1", "ARG 2", "ARG 3"] as const);
    const args = [...parsed.args];
    while (args.length < 3) args.push("");

    return (
      <div className="si-block" style={scopePastelStyle(parsed.name, level)}>
        {onRemove ? (
          <button
            type="button"
            className="function-block-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Quitar bloque"
          >
            -
          </button>
        ) : null}
        <div className="si-block-title">{parsed.name}</div>
        {args.map((slotExpression, slotOffset) => {
          const roleClass = slotOffset === 0 ? "slot-cond" : slotOffset === 1 ? "slot-true" : "slot-false";
          const branchLabel = labels[slotOffset as 0 | 1 | 2] ?? `ARG ${slotOffset + 1}`;
          const branchTokens = tokenizeFormulaExpression(slotExpression, { conceptCodeById }).map(
            (tk, i) => ({
              ...tk,
              id: `${pathKey}:${slotOffset}:${i}`
            })
          );
          return (
            <div key={`${pathKey}:${slotOffset}`} className={`si-branch ${roleClass}`}>
              <strong>{branchLabel}</strong>
              <div
                className="si-branch-content"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDropToNestedArgAt(
                    e,
                    blockExpr,
                    onChange,
                    pathKey,
                    slotOffset,
                    branchTokens.length
                  );
                }}
              >
                {branchTokens.length === 0 ? (
                  <div
                    className="empty-drop-target"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) =>
                      onDropToNestedArgAt(e, blockExpr, onChange, pathKey, slotOffset, 0)
                    }
                  />
                ) : (
                  <FormulaInlineEditor
                    tokens={branchTokens}
                    dndEnabled={!isInlineEditing}
                    onInsertAt={(rawValue, insertAt) =>
                      insertRawTextIntoNestedArg(
                        blockExpr,
                        onChange,
                        slotOffset,
                        insertAt,
                        rawValue
                      )
                    }
                    onDropAt={(e, insertAt) =>
                      onDropToNestedArgAt(e, blockExpr, onChange, pathKey, slotOffset, insertAt)
                    }
                    renderToken={(branchToken, branchIndex) =>
                      branchToken.kind === "block" ? (
                        <div
                          className="formula-block-token"
                          draggable={!isInlineEditing}
                          onDragStart={(e) => {
                            if (isInlineEditing) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            e.stopPropagation();
                            e.dataTransfer.setData(
                              "text/block-local-token-json",
                              JSON.stringify({
                                pathKey,
                                argIndex: slotOffset,
                                tokenIndex: branchIndex,
                                token: branchToken
                              })
                            );
                            e.dataTransfer.setData("text/token-json", JSON.stringify(branchToken));
                            e.dataTransfer.effectAllowed = "move";
                            setCursorGhost(e, branchToken.label);
                          }}
                        >
                          {renderFunctionBlockEditor(
                            branchToken.expression,
                            (nestedNext) => {
                              onChange(
                                mutateBlockArgTokens(blockExpr, slotOffset, (tokens) => {
                                  const next = [...tokens];
                                  next[branchIndex] = {
                                    ...next[branchIndex],
                                    expression: nestedNext
                                  };
                                  return next;
                                })
                              );
                            },
                            `${pathKey}:${slotOffset}:${branchIndex}`,
                            level + 1,
                            () => {
                              onChange(
                                mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                                  tokens.filter((_, i) => i !== branchIndex)
                                )
                              );
                            }
                          )}
                        </div>
                      ) : branchToken.kind === "text" ? (
                        editingTextTokenId === `${pathKey}:${slotOffset}:${branchIndex}` ? (
                          <div className="text-token-edit-wrap" ref={textTokenEditRef}>
                            <input
                              className="text-token-input"
                              value={editingTextDraft}
                              onChange={(e) => setEditingTextDraft(e.target.value)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              draggable={false}
                              onDragStart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              style={{ width: `${Math.max(4, editingTextDraft.length + 1)}ch` }}
                              onBlur={() => {
                                const nextValue = editingTextDraft.trim();
                                if (!nextValue) {
                                  onChange(
                                    mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                                      tokens.filter((_, i) => i !== branchIndex)
                                    )
                                  );
                                } else {
                                  onChange(
                                    mutateBlockArgTokens(blockExpr, slotOffset, (tokens) => {
                                      const next = [...tokens];
                                      next[branchIndex] = {
                                        ...next[branchIndex],
                                        label: nextValue,
                                        expression: nextValue
                                      };
                                      return next;
                                    })
                                  );
                                }
                                setEditingTextTokenId(null);
                                setEditingTextDraft("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingTextTokenId(null);
                                  setEditingTextDraft("");
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <span
                            className="formula-text"
                            draggable={!isInlineEditing}
                            onDragStart={(e) => {
                              if (isInlineEditing) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              e.stopPropagation();
                              e.dataTransfer.setData(
                                "text/block-local-token-json",
                                JSON.stringify({
                                  pathKey,
                                  argIndex: slotOffset,
                                  tokenIndex: branchIndex,
                                  token: branchToken
                                })
                              );
                              e.dataTransfer.setData("text/token-json", JSON.stringify(branchToken));
                              e.dataTransfer.effectAllowed = "move";
                              setCursorGhost(e, branchToken.label);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTextTokenId(`${pathKey}:${slotOffset}:${branchIndex}`);
                              setEditingTextDraft(branchToken.label);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              onChange(
                                mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                                  tokens.filter((_, i) => i !== branchIndex)
                                )
                              );
                            }}
                          >
                            {branchToken.label}
                          </span>
                        )
                      ) : isConstExpression(branchToken.expression) &&
                        editingConstTokenId === `${pathKey}:${slotOffset}:${branchIndex}` ? (
                        <input
                          className="text-token-input"
                          value={editingConstDraft}
                          onChange={(e) => setEditingConstDraft(e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          autoFocus
                          draggable={false}
                          onDragStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          style={{ width: `${Math.max(4, editingConstDraft.length + 1)}ch` }}
                          onBlur={() => {
                            const nextValue = editingConstDraft.trim();
                            if (!nextValue) {
                              onChange(
                                mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                                  tokens.filter((_, i) => i !== branchIndex)
                                )
                              );
                            } else {
                              onChange(
                                mutateBlockArgTokens(blockExpr, slotOffset, (tokens) => {
                                  const next = [...tokens];
                                  next[branchIndex] = {
                                    ...next[branchIndex],
                                    label: nextValue,
                                    expression: buildConstExpression(nextValue)
                                  };
                                  return next;
                                })
                              );
                            }
                            setEditingConstTokenId(null);
                            setEditingConstDraft("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingConstTokenId(null);
                              setEditingConstDraft("");
                            }
                          }}
                        />
                      ) : (
                        <button
                          className={`formula-pill ${branchToken.kind}${
                            isConstExpression(branchToken.expression)
                              ? " const-pill"
                              : isMathExpression(branchToken.expression)
                                ? " math-pill"
                                : isTagAggregationExpression(branchToken.expression)
                                  ? " tag-pill"
                                : ""
                          }`}
                          draggable={!isInlineEditing}
                          onDragStart={(e) => {
                            if (isInlineEditing) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            e.stopPropagation();
                            e.dataTransfer.setData(
                              "text/block-local-token-json",
                              JSON.stringify({
                                pathKey,
                                argIndex: slotOffset,
                                tokenIndex: branchIndex,
                                token: branchToken
                              })
                            );
                            e.dataTransfer.setData("text/token-json", JSON.stringify(branchToken));
                            e.dataTransfer.effectAllowed = "move";
                            setCursorGhost(e, branchToken.label);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isConstExpression(branchToken.expression)) {
                              setEditingConstTokenId(`${pathKey}:${slotOffset}:${branchIndex}`);
                              setEditingConstDraft(parseConstValue(branchToken.expression));
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            onChange(
                              mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                                tokens.filter((_, i) => i !== branchIndex)
                              )
                            );
                          }}
                        >
                          {branchToken.kind === "concept" ? (
                            <span className="formula-pill-concept">
                              <span
                                className="concept-marker"
                                style={{ color: conceptVisualForToken(branchToken)?.color ?? "#334155" }}
                              >
                                {getShapeGlyph(conceptVisualForToken(branchToken)?.shape ?? "circle")}
                              </span>
                              {branchToken.label}
                            </span>
                          ) : isMathExpression(branchToken.expression) ? (
                            branchToken.expression.match(/^MATH\("((?:[^"\\]|\\.)*)"\)$/)?.[1] ?? branchToken.label
                          ) : (
                            branchToken.label
                          )}
                        </button>
                      )
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const resolveDroppedExpression = (event: DragEvent<HTMLElement>): string => {
    const blockPayload = event.dataTransfer.getData("text/block-token-json");
    if (blockPayload) {
      const parsed = JSON.parse(blockPayload) as { token?: FormulaToken };
      return parsed.token?.expression?.trim() ?? "";
    }
    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    if (internalTokenId) {
      const source = selectedConcept.formulaTokens.find((tk) => tk.id === internalTokenId);
      return source?.expression?.trim() ?? "";
    }
    const payload = event.dataTransfer.getData("text/token-json");
    if (payload) {
      const parsed = JSON.parse(payload) as FormulaToken;
      return parsed.expression.trim();
    }
    const fnTemplate = event.dataTransfer.getData("text/function-template");
    if (fnTemplate === "SI") {
      return serializeFunctionBlock("SI", ["", "", ""]);
    }
    return "";
  };

  const onDropToBlockArgAt = (
    event: DragEvent<HTMLElement>,
    blockId: string,
    argIndex: number,
    insertAt: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (isInlineEditing) return;

    const blockPayload = event.dataTransfer.getData("text/block-token-json");
    if (blockPayload) {
      const parsed = JSON.parse(blockPayload) as {
        sourceBlockId: string;
        sourceArgIndex: number;
        sourceTokenIndex: number;
        token: FormulaToken;
      };
      updateFormulaTokens(
        selectedConcept.formulaTokens.map((tk) => {
          if (tk.kind !== "block") return tk;
          const block = parseFunctionBlock(tk.expression);
          if (!block) return tk;
          const nextArgs = [...block.args];
          while (nextArgs.length < 3) nextArgs.push("");

          if (tk.id === parsed.sourceBlockId) {
          const sourceTokens = tokenizeFormulaExpression(nextArgs[parsed.sourceArgIndex] ?? "", {
            conceptCodeById
          });
            if (parsed.sourceTokenIndex >= 0 && parsed.sourceTokenIndex < sourceTokens.length) {
              sourceTokens.splice(parsed.sourceTokenIndex, 1);
              nextArgs[parsed.sourceArgIndex] = formulaToExpression(sourceTokens);
            }
          }

          if (tk.id === blockId) {
            const targetTokens = tokenizeFormulaExpression(nextArgs[argIndex] ?? "", {
              conceptCodeById
            });
            const safeInsertAt = Math.max(0, Math.min(insertAt, targetTokens.length));
            targetTokens.splice(
              safeInsertAt,
              0,
              token(parsed.token.label, parsed.token.expression, parsed.token.kind)
            );
            nextArgs[argIndex] = formulaToExpression(targetTokens);
          }

          return { ...tk, expression: serializeFunctionBlock(block.name, nextArgs) };
        })
      );
      return;
    }

    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    if (internalTokenId) {
      const source = selectedConcept.formulaTokens.find((tk) => tk.id === internalTokenId);
      if (!source) return;
      updateFormulaTokens(
        selectedConcept.formulaTokens
          .filter((tk) => tk.id !== internalTokenId)
          .map((tk) => {
            if (tk.id !== blockId || tk.kind !== "block") return tk;
            const block = parseFunctionBlock(tk.expression);
            if (!block) return tk;
            const nextArgs = [...block.args];
            while (nextArgs.length < 3) nextArgs.push("");
            const targetTokens = tokenizeFormulaExpression(nextArgs[argIndex] ?? "", {
              conceptCodeById
            });
            const safeInsertAt = Math.max(0, Math.min(insertAt, targetTokens.length));
            targetTokens.splice(safeInsertAt, 0, token(source.label, source.expression, source.kind));
            nextArgs[argIndex] = formulaToExpression(targetTokens);
            return { ...tk, expression: serializeFunctionBlock(block.name, nextArgs) };
          })
      );
      return;
    }

    const payload = event.dataTransfer.getData("text/token-json");
    if (payload) {
      const parsed = JSON.parse(payload) as FormulaToken;
      updateBlockArgTokens(blockId, argIndex, (tokens) => {
        const next = [...tokens];
        const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
        next.splice(safeInsertAt, 0, token(parsed.label, parsed.expression, parsed.kind));
        return next;
      });
      return;
    }

    const fnTemplate = event.dataTransfer.getData("text/function-template");
    if (fnTemplate === "SI") {
      updateBlockArgTokens(blockId, argIndex, (tokens) => {
        const next = [...tokens];
        const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
        next.splice(
          safeInsertAt,
          0,
          token("SI", serializeFunctionBlock("SI", ["", "", ""]), "block")
        );
        return next;
      });
    }
  };

  const onTokenDropToFormula = (event: DragEvent<HTMLElement>, insertAt?: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (isInlineEditing) return;
    const targetIndex =
      insertAt ?? dragInsertIndex ?? selectedConcept.formulaTokens.length;

    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    if (internalTokenId) {
      const current = [...(selectedConcept.formulaTokens ?? [])];
      const fromIndex = current.findIndex((item) => item.id === internalTokenId);
      if (fromIndex !== -1) {
        const [moved] = current.splice(fromIndex, 1);
        const adjustedIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
        current.splice(Math.max(0, adjustedIndex), 0, moved);
        updateFormulaTokens(current);
      }
      setDragInsertIndex(null);
      setDraggingFormulaTokenId(null);
      return;
    }

    const payload = event.dataTransfer.getData("text/token-json");
    if (payload) {
      insertTokenAt(JSON.parse(payload) as FormulaToken, targetIndex);
      setDragInsertIndex(null);
      return;
    }
    const ifTemplate = event.dataTransfer.getData("text/function-template");
    if (ifTemplate === "SI" || ifTemplate === "CONSTANTE" || ifTemplate.startsWith("MATH:")) {
      if (ifTemplate === "SI") {
        insertIfTemplateAt(targetIndex);
      } else if (ifTemplate === "CONSTANTE") {
        insertTokenAt(token("const", buildConstExpression("0"), "function"), targetIndex);
      } else {
        const op = ifTemplate.slice("MATH:".length);
        insertTokenAt(token(op, `MATH("${op}")`, "function"), targetIndex);
      }
      setDragInsertIndex(null);
      return;
    }
    const tagPayload = event.dataTransfer.getData("text/tag-name");
    if (tagPayload) {
      setTagModal({
        open: true,
        tag: tagPayload,
        insertAt: targetIndex
      });
      setDragInsertIndex(null);
    }
  };

  const addReceipt = () => {
    const id = `recibo_${receipts.length + 1}`;
    const newReceipt: ReceiptModel = {
      id,
      name: `Recibo ${receipts.length + 1}`,
      convenio: activeConvenio,
      definitiveOrder: definitivos.map((c) => c.id)
    };
    setReceipts((prev) => [...prev, newReceipt]);
    setActiveReceiptId(id);
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
      formulaTokens: []
    };
    setConcepts((prev) => [...prev, newConcept]);
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
      formulaTokens: []
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
        definitiveOrder: receipt.definitiveOrder.filter((id) => id !== removingId)
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

  const startEditTextToken = (tk: FormulaToken) => {
    setEditingTextTokenId(tk.id);
    setEditingTextDraft(tk.kind === "slot" ? stripSlotSuffix(tk.expression) : tk.label);
  };

  const commitTextTokenEdit = () => {
    if (!editingTextTokenId) return;
    const nextValue = editingTextDraft.trim();
    if (!nextValue) {
      updateFormulaTokens(
        selectedConcept.formulaTokens.filter((item) => item.id !== editingTextTokenId)
      );
    } else {
      updateFormulaTokens(
        selectedConcept.formulaTokens.map((item) =>
          item.id === editingTextTokenId
            ? item.kind === "slot"
              ? {
                  ...item,
                  label: nextValue,
                  expression: `${nextValue}${slotSuffixFor(item.expression)}`
                }
              : { ...item, label: nextValue, expression: nextValue }
            : item
        )
      );
    }
    setEditingTextTokenId(null);
    setEditingTextDraft("");
  };

  const removeEditingTextToken = () => {
    if (!editingTextTokenId) return;
    updateFormulaTokens(
      selectedConcept.formulaTokens.filter((item) => item.id !== editingTextTokenId)
    );
    setEditingTextTokenId(null);
    setEditingTextDraft("");
  };

  const conceptVisualForToken = (tk: FormulaToken) => {
    const byId = tk.expression.match(/^CONCEPTO\((\d+)\)$/);
    if (byId) {
      const concept = concepts.find((c) => c.id === Number(byId[1]));
      if (concept) return concept;
    }
    const byCode = tk.expression.match(/^CCONCEPTO\("([^"]+)"\)$/);
    if (byCode) {
      const concept = concepts.find((c) => c.code === byCode[1]);
      if (concept) return concept;
    }
    return null;
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
    if (!editingTextTokenId) return;
    const isRootTokenEditor = editingTextTokenId.startsWith("tk_");
    if (!isRootTokenEditor) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!textTokenEditRef.current) return;
      if (textTokenEditRef.current.contains(event.target as Node)) return;
      commitTextTokenEdit();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [editingTextTokenId, editingTextDraft, selectedConcept.formulaTokens]);

  useEffect(() => {
    setDragInsertIndex(null);
    setDraggingFormulaTokenId(null);
  }, [editingId]);

  useEffect(() => {
    setEditingTextTokenId(null);
    setEditingTextDraft("");
  }, [editingId]);

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

  return (
    <div className="layout">
      <header className="topbar">
        <h1>RRSH Payroll</h1>
        <nav className="topbar-nav" aria-label="Navegacion principal">
          <button className={menu === "dashboard" ? "menu active" : "menu"} onClick={() => setMenu("dashboard")}>
            Dashboard
          </button>
          <button className={menu === "modelo" ? "menu active" : "menu"} onClick={() => setMenu("modelo")}>
            Modelo de liquidacion
          </button>
          <button className={menu === "novedades" ? "menu active" : "menu"} onClick={() => setMenu("novedades")}>
            Novedades
          </button>
          <button className={menu === "afip" ? "menu active" : "menu"} onClick={() => setMenu("afip")}>
            Contable / AFIP
          </button>
        </nav>
      </header>

      <main className="content">
        {menu !== "modelo" ? (
          <section className="placeholder">
            <h2>{menu === "dashboard" ? "Dashboard" : menu === "novedades" ? "Novedades" : "Contable / AFIP"}</h2>
            <p>Seccion en construccion. El foco de este MVP es Modelo de liquidacion.</p>
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
                    <option>Luz y Fuerza</option>
                    <option>APUAYE</option>
                    <option>Otro convenio</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="receipt">Recibo</label>
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
                        {receipt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="add-button" onClick={addReceipt}>
                  + Nuevo recibo
                </button>
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
              <div
                className="formula-dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (isInlineEditing) return;
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => onTokenDropToFormula(e)}
                onDoubleClick={(e) => {
                  if (isInlineEditing) return;
                  if (e.target !== e.currentTarget) return;
                  setRootInsertSignal((v) => (v ?? 0) + 1);
                }}
              >
                <FormulaInlineEditor
                  tokens={selectedConcept.formulaTokens}
                  dndEnabled={!isInlineEditing}
                  onInsertAt={(rawValue, insertAt) => insertFromRawTextAt(rawValue, insertAt)}
                  openInsertAtEndSignal={rootInsertSignal}
                  onDropAt={(e, insertAt) => onTokenDropToFormula(e, insertAt)}
                  onEmptyDrop={(e) => onTokenDropToFormula(e, 0)}
                  renderToken={(tk, index) =>
                    tk.kind === "block" ? (
                      <div
                        className="formula-block-token"
                        draggable={!isInlineEditing}
                        onDragStart={(e) => {
                          if (isInlineEditing) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                          e.stopPropagation();
                          e.dataTransfer.setData("text/formula-token-id", tk.id);
                          e.dataTransfer.setData("text/token-json", JSON.stringify(tk));
                          e.dataTransfer.effectAllowed = "move";
                          setCursorGhost(e, tk.label);
                          setDraggingFormulaTokenId(tk.id);
                        }}
                        onDragEnd={() => {
                          setDraggingFormulaTokenId(null);
                          setDragInsertIndex(null);
                        }}
                      >
                        {renderFunctionBlockEditor(
                          tk.expression,
                          (nextExpr) => {
                            updateFormulaTokens(
                              selectedConcept.formulaTokens.map((item) =>
                                item.id === tk.id ? { ...item, expression: nextExpr } : item
                              )
                            );
                          },
                          tk.id,
                          0,
                          () => {
                            updateFormulaTokens(
                              selectedConcept.formulaTokens.filter((item) => item.id !== tk.id)
                            );
                          }
                        )}
                      </div>
                    ) : tk.kind === "text" ? (
                      editingTextTokenId === tk.id ? (
                        <div className="text-token-edit-wrap" ref={textTokenEditRef}>
                          <input
                            className="text-token-input"
                            value={editingTextDraft}
                            onChange={(e) => setEditingTextDraft(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            draggable={false}
                            onDragStart={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            style={{ width: `${Math.max(4, editingTextDraft.length + 1)}ch` }}
                            onBlur={() => {
                              if (editingTextTokenId === tk.id) commitTextTokenEdit();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitTextTokenEdit();
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setEditingTextTokenId(null);
                                setEditingTextDraft("");
                              }
                            }}
                          />
                          <button
                            className="text-token-remove-float"
                            onClick={removeEditingTextToken}
                            title="Borrar texto"
                          >
                            -
                          </button>
                        </div>
                      ) : (
                        <span
                          className="formula-text"
                          draggable={!isInlineEditing}
                          onDragStart={(e) => {
                            if (isInlineEditing) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            e.stopPropagation();
                            e.dataTransfer.setData("text/formula-token-id", tk.id);
                            e.dataTransfer.effectAllowed = "move";
                            setCursorGhost(e, tk.label);
                            setDraggingFormulaTokenId(tk.id);
                          }}
                          onDragEnd={() => {
                            setDraggingFormulaTokenId(null);
                            setDragInsertIndex(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditTextToken(tk);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            updateFormulaTokens(
                              selectedConcept.formulaTokens.filter((item) => item.id !== tk.id)
                            );
                          }}
                          title="Click para editar"
                          style={{ opacity: draggingFormulaTokenId === tk.id ? 0.12 : 1 }}
                        >
                          {tk.label}
                        </span>
                      )
                    ) : (
                      isConstExpression(tk.expression) && editingConstTokenId === tk.id ? (
                        <input
                          className="text-token-input"
                          value={editingConstDraft}
                          onChange={(e) => setEditingConstDraft(e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          autoFocus
                          draggable={false}
                          onDragStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          style={{ width: `${Math.max(4, editingConstDraft.length + 1)}ch` }}
                          onBlur={() => saveConstAtRoot(tk.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingConstTokenId(null);
                              setEditingConstDraft("");
                            }
                          }}
                        />
                      ) : (
                        <button
                          className={`formula-pill ${tk.kind}${
                            isConstExpression(tk.expression)
                              ? " const-pill"
                              : isMathExpression(tk.expression)
                                ? " math-pill"
                                : isTagAggregationExpression(tk.expression)
                                  ? " tag-pill"
                                : ""
                          }`}
                          draggable={!isInlineEditing}
                          onDragStart={(e) => {
                            if (isInlineEditing) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            e.stopPropagation();
                            e.dataTransfer.setData("text/formula-token-id", tk.id);
                            e.dataTransfer.effectAllowed = "move";
                            setCursorGhost(e, tk.label);
                            setDraggingFormulaTokenId(tk.id);
                          }}
                          onDragEnd={() => {
                            setDraggingFormulaTokenId(null);
                            setDragInsertIndex(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isConstExpression(tk.expression)) {
                              setEditingConstTokenId(tk.id);
                              setEditingConstDraft(parseConstValue(tk.expression));
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            updateFormulaTokens(
                              selectedConcept.formulaTokens.filter((item) => item.id !== tk.id)
                            );
                          }}
                          title="Click izq: editar constante. Click der: quitar"
                          style={{ opacity: draggingFormulaTokenId === tk.id ? 0.12 : 1 }}
                        >
                          {tk.kind === "concept" ? (
                            <span className="formula-pill-concept">
                              <span
                                className="concept-marker"
                                style={{ color: conceptVisualForToken(tk)?.color ?? "#334155" }}
                              >
                                {getShapeGlyph(conceptVisualForToken(tk)?.shape ?? "circle")}
                              </span>
                              {tk.label}
                            </span>
                          ) : isMathExpression(tk.expression) ? (
                            tk.expression.match(/^MATH\("((?:[^"\\]|\\.)*)"\)$/)?.[1] ?? tk.label
                          ) : (
                            tk.label
                          )}
                        </button>
                      )
                    )
                  }
                />
              </div>
              <div className="formula-text-section">
                <h3>Formula</h3>
                <input
                  className="formula-text-live-input"
                  value={formulaToExpression(selectedConcept.formulaTokens ?? [])}
                  onChange={(e) => {
                    updateFormulaTokens(
                      tokenizeFormulaExpression(e.target.value, {
                        conceptCodeById
                      })
                    );
                  }}
                  placeholder='Ej: CCONCEPTO("BASICO") MATH("*") PARAM("porc_antiguedad")'
                />
              </div>
              <div className="preview">
                <h3>Pre-calculo de prueba</h3>
                <p>
                  <strong>
                    {cycleConceptIds.has(selectedConcept.id)
                      ? "Error (ciclo DAG)"
                      : previewInfo.value === null
                      ? `Error: ${previewInfo.error ?? "error de compilacion"}`
                      : `$${previewInfo.value.toLocaleString("es-AR")}`}
                  </strong>
                </p>
              </div>
            </article>

            <article className="panel drawer">
              <h2>Herramientas</h2>

              <div className="drawer-header">
                <h3>Conceptos transitorios</h3>
                <button className="add-button" onClick={addTransitory}>
                  + Nuevo transitorio
                </button>
              </div>
              <div className="chip-wrap">
                {transitorios.map((concept) => (
                  <button
                    key={concept.id}
                    className="chip transitorio"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copyMove";
                      setCursorGhost(e, concept.code);
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
                    onClick={() => {
                      setEditingId(concept.id);
                    }}
                  >
                    <span className="concept-marker" style={{ color: concept.color }}>
                      {getShapeGlyph(concept.shape)}
                    </span>
                    {concept.code}
                  </button>
                ))}
              </div>

              <h3>Funciones</h3>
              <div className="chip-wrap">
                <button
                  className="chip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    setCursorGhost(e, "SI");
                    e.dataTransfer.setData("text/function-template", "SI");
                  }}
                  onClick={() => insertIfTemplateAt(selectedConcept.formulaTokens.length)}
                >
                  SI
                </button>
                <button
                  className="chip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    setCursorGhost(e, "CONSTANTE");
                    e.dataTransfer.setData("text/function-template", "CONSTANTE");
                    e.dataTransfer.setData(
                      "text/token-json",
                      JSON.stringify(token("0", buildConstExpression("0"), "function"))
                    );
                  }}
                  onClick={() =>
                    insertTokenAt(token("const", buildConstExpression("0"), "function"), selectedConcept.formulaTokens.length)
                  }
                >
                  CONSTANTE
                </button>
              </div>

              <h3>Funciones matematicas</h3>
              <div className="chip-wrap">
                {["+", "-", "*", "/", "(", ")", "[", "]", "%", ">", "<", ">=", "<=", "=", "<>"].map((op) => (
                  <button
                    key={op}
                    className="chip"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copyMove";
                      setCursorGhost(e, op);
                      e.dataTransfer.setData("text/function-template", `MATH:${op}`);
                      e.dataTransfer.setData(
                        "text/token-json",
                        JSON.stringify(token(op, `MATH("${op}")`, "function"))
                      );
                    }}
                    onClick={() => insertTokenAt(token(op, `MATH("${op}")`, "function"), selectedConcept.formulaTokens.length)}
                  >
                    {op}
                  </button>
                ))}
              </div>

              <h3>Tags</h3>
              <div className="chip-wrap">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className="chip"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copyMove";
                      setCursorGhost(e, `#${tag}`);
                      e.dataTransfer.setData("text/tag-name", tag);
                    }}
                    onClick={() =>
                      setTagModal({
                        open: true,
                        tag,
                        insertAt: selectedConcept.formulaTokens.length
                      })
                    }
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </article>
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
