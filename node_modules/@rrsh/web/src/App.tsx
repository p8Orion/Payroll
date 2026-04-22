import { DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { colorPalette30, shapeCycle } from "./model/constants";
import {
  formulaToExpression,
  getShapeGlyph,
  token,
  tokenizeFormulaExpression
} from "./model/helpers";
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
const functionBlockTemplates = {
  SI: {
    blockTitle: "SI",
    branches: ["CONDICIÓN", "ENTONCES", "SI NO"] as const
  }
} as const;

interface FunctionBlockModel {
  name: string;
  args: string[];
}

function normalizeExcelIf(expression: string): string {
  let out = "";
  let depth = 0;
  const ifStack: number[] = [];

  for (let i = 0; i < expression.length; i++) {
    if (expression.startsWith("SI(", i)) {
      out += "IF(";
      depth += 1;
      ifStack.push(depth);
      i += 2;
      continue;
    }

    const ch = expression[i];
    if (ch === "(") {
      depth += 1;
      out += ch;
      continue;
    }
    if (ch === ")") {
      if (ifStack.length && ifStack[ifStack.length - 1] === depth) {
        ifStack.pop();
      }
      depth = Math.max(0, depth - 1);
      out += ch;
      continue;
    }
    if (ch === ";" && ifStack.length > 0) {
      out += ",";
      continue;
    }
    out += ch;
  }

  return out;
}

function normalizeExcelComparators(expression: string): string {
  return expression
    .replace(/<>/g, "!=")
    .replace(/(?<![<>=!])=(?!=)/g, "==");
}

function parseFunctionBlock(expression: string): FunctionBlockModel | null {
  const trimmed = expression.trim();
  if (!trimmed.startsWith("[[") || !trimmed.endsWith("]]")) return null;
  const inner = trimmed.slice(2, -2);
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "[[") {
      depth += 1;
      current += two;
      i += 1;
      continue;
    }
    if (two === "]]" && depth > 0) {
      depth -= 1;
      current += two;
      i += 1;
      continue;
    }
    if (inner[i] === "|" && depth === 0) {
      args.push(current);
      current = "";
      continue;
    }
    current += inner[i];
  }
  args.push(current);
  if (!args.length) return null;
  return { name: (args[0] ?? "").trim().toUpperCase(), args: args.slice(1) };
}

function serializeFunctionBlock(name: string, args: string[]): string {
  return `[[${name}|${args.join("|")}]]`;
}

function expandBracketBlocksToExpressions(expression: string): string {
  let out = "";
  let i = 0;
  while (i < expression.length) {
    const two = expression.slice(i, i + 2);
    if (two !== "[[") {
      out += expression[i];
      i += 1;
      continue;
    }
    let depth = 1;
    let j = i + 2;
    while (j < expression.length && depth > 0) {
      const nextTwo = expression.slice(j, j + 2);
      if (nextTwo === "[[") {
        depth += 1;
        j += 2;
        continue;
      }
      if (nextTwo === "]]") {
        depth -= 1;
        j += 2;
        continue;
      }
      j += 1;
    }
    const blockRaw = expression.slice(i, j);
    const block = parseFunctionBlock(blockRaw);
    if (!block) {
      out += blockRaw;
      i = j;
      continue;
    }
    if (block.name === "SI") {
      const cond = expandBracketBlocksToExpressions(block.args[0] ?? "");
      const whenTrue = expandBracketBlocksToExpressions(block.args[1] ?? "");
      const whenFalse = expandBracketBlocksToExpressions(block.args[2] ?? "");
      out += `SI(${cond};${whenTrue};${whenFalse})`;
    } else {
      out += blockRaw;
    }
    i = j;
  }
  return out;
}

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
  const [insertDrafts, setInsertDrafts] = useState<Record<number, string>>({});
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const [draggingFormulaTokenId, setDraggingFormulaTokenId] = useState<string | null>(null);
  const [editingTextTokenId, setEditingTextTokenId] = useState<string | null>(null);
  const [editingTextDraft, setEditingTextDraft] = useState("");
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
  const previewResult = useMemo(() => {
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
      }

      return values.get(selectedConcept.id) ?? null;
    } catch {
      return null;
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
    const parsed = tokenizeFormulaExpression(content);
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

  const onTokenDropToFormula = (event: DragEvent<HTMLElement>, insertAt?: number) => {
    event.preventDefault();
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
    if (ifTemplate === "SI") {
      insertIfTemplateAt(targetIndex);
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

  const submitInsertAt = (index: number) => {
    const value = (insertDrafts[index] ?? "").trim();
    if (!value) return;
    insertTokenAt(token(value, value, "text"), index);
    setInsertDrafts((old) => ({ ...old, [index]: "" }));
  };

  const shouldShowInsertEditor = (index: number) => {
    const tokens = selectedConcept.formulaTokens ?? [];
    const left = tokens[index - 1];
    const right = tokens[index];
    const leftIsPillOrEmpty = !left || left.kind !== "text";
    const rightIsPillOrEmpty = !right || right.kind !== "text";
    return leftIsPillOrEmpty && rightIsPillOrEmpty;
  };

  const renderInsertEditor = (index: number) => (
    <input
      className="formula-insert-input"
      value={insertDrafts[index] ?? ""}
      onChange={(e) => setInsertDrafts((old) => ({ ...old, [index]: e.target.value }))}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      style={{ width: `${Math.max(4, (insertDrafts[index] ?? "").length + 1)}ch` }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitInsertAt(index);
        }
      }}
    />
  );

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
    setInsertDrafts({});
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
      <aside className="sidebar">
        <h1>RRSH Payroll</h1>
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
      </aside>

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
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => onTokenDropToFormula(e)}
              >
                {(selectedConcept.formulaTokens ?? []).length === 0
                  ? renderInsertEditor(0)
                  : selectedConcept.formulaTokens.map((tk, index) => (
                  <div
                    key={tk.id}
                    className="formula-segment"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      onTokenDropToFormula(e, index);
                    }}
                  >
                    <span
                      className={dragInsertIndex === index ? "drag-insert-cursor active" : "drag-insert-cursor"}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragInsertIndex(index);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onTokenDropToFormula(e, index);
                      }}
                    />
                    {index === 0 && shouldShowInsertEditor(0) && renderInsertEditor(0)}
                    {tk.kind === "block" ? (
                      <div className="si-block">
                        <div className="si-block-title">{parseFunctionBlock(tk.expression)?.name ?? tk.label}</div>
                        {(parseFunctionBlock(tk.expression)?.args ?? ["", "", ""]).map((slotExpression, slotOffset) => {
                          const roleClass = slotOffset === 0 ? "slot-cond" : slotOffset === 1 ? "slot-true" : "slot-false";
                          const branchLabel =
                            functionBlockTemplates.SI.branches[slotOffset as 0 | 1 | 2] ?? `ARG ${slotOffset + 1}`;
                          return (
                            <div key={`${tk.id}-${slotOffset}`} className={`si-branch ${roleClass}`}>
                              <strong>{branchLabel}</strong>
                              {editingTextTokenId === `${tk.id}:${slotOffset}` ? (
                                <div className="text-token-edit-wrap" ref={textTokenEditRef}>
                                  <input
                                    className="text-token-input"
                                    value={editingTextDraft}
                                    onChange={(e) => setEditingTextDraft(e.target.value)}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    style={{ width: `${Math.max(8, editingTextDraft.length + 1)}ch` }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        updateBlockArg(tk.id, slotOffset, editingTextDraft);
                                        setEditingTextTokenId(null);
                                        setEditingTextDraft("");
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
                                  className="si-branch-content"
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }}
                                  onDrop={(e) => onDropToBlockArg(e, tk.id, slotOffset)}
                                  onClick={() => {
                                    setEditingTextTokenId(`${tk.id}:${slotOffset}`);
                                    setEditingTextDraft(slotExpression);
                                  }}
                                >
                                  {renderSlotContent(`${slotExpression};`)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : tk.kind === "text" ? (
                      editingTextTokenId === tk.id ? (
                        <div className="text-token-edit-wrap" ref={textTokenEditRef}>
                          <input
                            className="text-token-input"
                            value={editingTextDraft}
                            onChange={(e) => setEditingTextDraft(e.target.value)}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            style={{ width: `${Math.max(4, editingTextDraft.length + 1)}ch` }}
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
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/formula-token-id", tk.id);
                            e.dataTransfer.effectAllowed = "move";
                            setCursorGhost(e, tk.label);
                            setDraggingFormulaTokenId(tk.id);
                          }}
                          onDragEnd={() => {
                            setDraggingFormulaTokenId(null);
                            setDragInsertIndex(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            onTokenDropToFormula(e, index);
                          }}
                          onClick={() => startEditTextToken(tk)}
                          title="Click para editar"
                          style={{
                            opacity: draggingFormulaTokenId === tk.id ? 0.12 : 1
                          }}
                        >
                          {tk.label}
                        </span>
                      )
                    ) : tk.kind === "slot" ? (
                      editingTextTokenId === tk.id ? (
                        <div className="text-token-edit-wrap" ref={textTokenEditRef}>
                          <input
                            className="text-token-input"
                            value={editingTextDraft}
                            onChange={(e) => setEditingTextDraft(e.target.value)}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            style={{ width: `${Math.max(6, editingTextDraft.length + 1)}ch` }}
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
                        </div>
                      ) : (
                        <span
                          className={`formula-slot ${slotRoleAt(index) ? `slot-${slotRoleAt(index)}` : ""}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => replaceSlotWithDroppedToken(e, tk.id)}
                          onClick={() => startEditTextToken(tk)}
                        >
                          <strong>{tk.label}</strong>
                          <span className="slot-content">{renderSlotContent(tk.expression)}</span>
                        </span>
                      )
                    ) : (
                      <button
                        className={`formula-pill ${tk.kind}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/formula-token-id", tk.id);
                          e.dataTransfer.effectAllowed = "move";
                          setCursorGhost(e, tk.label);
                          setDraggingFormulaTokenId(tk.id);
                        }}
                        onDragEnd={() => {
                          setDraggingFormulaTokenId(null);
                          setDragInsertIndex(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          onTokenDropToFormula(e, index);
                        }}
                        onClick={() =>
                          updateFormulaTokens(selectedConcept.formulaTokens.filter((item) => item.id !== tk.id))
                        }
                        title="Click para quitar"
                        style={{
                          opacity: draggingFormulaTokenId === tk.id ? 0.12 : 1
                        }}
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
                        ) : (
                          tk.label
                        )}
                      </button>
                    )}
                    {shouldShowInsertEditor(index + 1) && renderInsertEditor(index + 1)}
                    {index === selectedConcept.formulaTokens.length - 1 && (
                      <span
                        className={
                          dragInsertIndex === index + 1
                            ? "drag-insert-cursor active"
                            : "drag-insert-cursor"
                        }
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDragInsertIndex(index + 1);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onTokenDropToFormula(e, index + 1);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="preview">
                <h3>Pre-calculo de prueba</h3>
                <p>
                  <strong>
                    {cycleConceptIds.has(selectedConcept.id)
                      ? "Error (ciclo DAG)"
                      : previewResult === null
                      ? "Error"
                      : `$${previewResult.toLocaleString("es-AR")}`}
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
