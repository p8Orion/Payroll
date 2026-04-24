import { createElement, DragEvent, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { FormulaBlockEditor } from "../../components/FormulaBlockEditor";
import { RootFormulaTokenRenderer } from "./RootFormulaTokenRenderer";
import {
  functionBlockTemplates,
  getFunctionBlockArity,
  parseFunctionBlock,
  serializeFunctionBlock
} from "../../model/function-blocks";
import {
  type AstNode,
  type FormulaDragSource,
  duplicateNestedAstNode,
  duplicateNestedAstNodeToRoot,
  duplicateRootAstNodeToNested,
  moveNestedAstNode,
  moveNestedAstNodeToRoot,
  moveRootAstNodeToNested,
  parseTokensToAst
} from "../../model/formula-dnd";
import { insertRawTextIntoBlockArg, mutateBlockArgExpression } from "../../model/formula-edit";
import { formulaToExpression, getShapeGlyph, tokenizeFormulaExpression, token } from "../../model/helpers";
import {
  buildConstExpression,
  isConstExpression,
  isMathExpression,
  isMathOperatorText,
  isTagAggregationExpression,
  parseConstValue
} from "../../model/formula-ui";
import { ConceptModel, FormulaToken } from "../../model/types";

interface TagModalState {
  open: boolean;
  tag: string;
  insertAt: number;
}

interface UseFormulaEditorParams {
  selectedConcept: ConceptModel;
  selectedFormulaTokens: FormulaToken[];
  selectedFormulaAst: AstNode[];
  conceptCodeById: Record<number, string>;
  concepts: ConceptModel[];
  setConcepts: React.Dispatch<React.SetStateAction<ConceptModel[]>>;
  setTagModal: React.Dispatch<React.SetStateAction<TagModalState>>;
  formulaDragSourceRef: React.MutableRefObject<FormulaDragSource | null>;
  setRootDragSource: (tokenId: string) => void;
  setNestedDragSource: (
    pathKey: string,
    argIndex: number,
    tokenIndex: number,
    token: FormulaToken
  ) => void;
  setCursorGhost: (event: DragEvent<HTMLElement>, label: string) => void;
}

export function useFormulaEditor({
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
}: UseFormulaEditorParams) {
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const [draggingFormulaTokenId, setDraggingFormulaTokenId] = useState<string | null>(null);
  const [editingTextTokenId, setEditingTextTokenId] = useState<string | null>(null);
  const [editingTextDraft, setEditingTextDraft] = useState("");
  const [editingConstTokenId, setEditingConstTokenId] = useState<string | null>(null);
  const [editingConstDraft, setEditingConstDraft] = useState("");
  const [rootInsertSignal, setRootInsertSignal] = useState<number | undefined>(undefined);
  const textTokenEditRef = useRef<HTMLDivElement | null>(null);

  const updateFormulaTokens = (tokens: FormulaToken[]) => {
    setConcepts((old) =>
      old.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, formulaAst: parseTokensToAst(tokens, conceptCodeById) }
          : c
      )
    );
  };

  const updateFormulaAst = (ast: AstNode[]) => {
    setConcepts((old) =>
      old.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, formulaAst: ast }
          : c
      )
    );
  };

  const insertTokenAt = (newToken: FormulaToken, index: number) => {
    const current = [...selectedFormulaTokens];
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

  const insertBlockTemplateAt = (name: "SI" | "BLOQUE" | "TOPE", index: number) => {
    const current = [...selectedFormulaTokens];
    const expr = serializeFunctionBlock(name, Array(getFunctionBlockArity(name)).fill(""));
    current.splice(index, 0, token(name, expr, "block"));
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
    if (closes > opens) return value.slice(0, -1);
    return value;
  };

  const mutateBlockArgTokens = (
    blockExpr: string,
    argIndex: number,
    updater: (tokens: FormulaToken[]) => FormulaToken[]
  ): string => mutateBlockArgExpression(blockExpr, argIndex, conceptCodeById, updater);

  const insertRawTextIntoNestedArg = (
    blockExpr: string,
    onChange: (next: string) => void,
    argIndex: number,
    insertAt: number,
    rawValue: string
  ) => {
    onChange(insertRawTextIntoBlockArg(blockExpr, argIndex, insertAt, rawValue, conceptCodeById));
  };

  const resolveDroppedExpression = (event: DragEvent<HTMLElement>): string => {
    const blockPayload = event.dataTransfer.getData("text/block-token-json");
    if (blockPayload) {
      const parsed = JSON.parse(blockPayload) as { token?: FormulaToken };
      return parsed.token?.expression?.trim() ?? "";
    }
    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    if (internalTokenId) {
      const source = selectedFormulaTokens.find((tk) => tk.id === internalTokenId);
      return source?.expression?.trim() ?? "";
    }
    const payload = event.dataTransfer.getData("text/token-json");
    if (payload) {
      const parsed = JSON.parse(payload) as FormulaToken;
      return parsed.expression.trim();
    }
    const fnTemplate = event.dataTransfer.getData("text/function-template");
    if (
      fnTemplate === "SI" ||
      fnTemplate === "BLOQUE" ||
      fnTemplate === "TOPE"
    ) {
      return serializeFunctionBlock(fnTemplate, Array(getFunctionBlockArity(fnTemplate)).fill(""));
    }
    return "";
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

    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    if (internalTokenId) {
      const nextAst = structuredClone(selectedFormulaAst) as AstNode[];
      const ok = event.ctrlKey
        ? duplicateRootAstNodeToNested(nextAst, internalTokenId, pathKey, argIndex, insertAt)
        : moveRootAstNodeToNested(nextAst, internalTokenId, pathKey, argIndex, insertAt);
      if (ok) updateFormulaAst(nextAst);
      return;
    }

    const localPayload = event.dataTransfer.getData("text/block-local-token-json");
    const parsedLocal = localPayload
      ? (JSON.parse(localPayload) as Extract<FormulaDragSource, { kind: "nested" }>)
      : null;
    if (parsedLocal) {
      const nextAst = structuredClone(selectedFormulaAst) as AstNode[];
      const ok = event.ctrlKey
        ? duplicateNestedAstNode(nextAst, parsedLocal, pathKey, argIndex, insertAt)
        : moveNestedAstNode(nextAst, parsedLocal, pathKey, argIndex, insertAt);
      if (ok) updateFormulaAst(nextAst);
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
    if (
      fnTemplate === "SI" ||
      fnTemplate === "BLOQUE" ||
      fnTemplate === "TOPE" ||
      fnTemplate === "CONSTANTE" ||
      fnTemplate.startsWith("MATH:")
    ) {
      const nextExpr = mutateBlockArgTokens(blockExpr, argIndex, (tokens) => {
        const next = [...tokens];
        const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
        if (
          fnTemplate === "SI" ||
          fnTemplate === "BLOQUE" ||
          fnTemplate === "TOPE"
        ) {
          next.splice(
            safeInsertAt,
            0,
            token(
              fnTemplate as "SI" | "BLOQUE" | "TOPE",
              serializeFunctionBlock(fnTemplate, Array(getFunctionBlockArity(fnTemplate)).fill("")),
              "block"
            )
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

  const onTokenDropToFormula = (event: DragEvent<HTMLElement>, insertAt?: number) => {
    event.preventDefault();
    const targetIndex = insertAt ?? dragInsertIndex ?? selectedFormulaTokens.length;

    const internalTokenId = event.dataTransfer.getData("text/formula-token-id");
    if (internalTokenId) {
      const current = [...selectedFormulaTokens];
      const fromIndex = current.findIndex((item) => item.id === internalTokenId);
      if (fromIndex !== -1) {
        if (event.ctrlKey) {
          const source = current[fromIndex];
          if (source) current.splice(Math.max(0, targetIndex), 0, token(source.label, source.expression, source.kind));
        } else {
          const [moved] = current.splice(fromIndex, 1);
          const adjustedIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
          current.splice(Math.max(0, adjustedIndex), 0, moved);
        }
        updateFormulaTokens(current);
      }
      setDragInsertIndex(null);
      setDraggingFormulaTokenId(null);
      return;
    }

    const localPayload = event.dataTransfer.getData("text/block-local-token-json");
    const parsedLocal = localPayload
      ? (JSON.parse(localPayload) as Extract<FormulaDragSource, { kind: "nested" }>)
      : null;
    if (parsedLocal) {
      const nextAst = structuredClone(selectedFormulaAst) as AstNode[];
      const ok = event.ctrlKey
        ? duplicateNestedAstNodeToRoot(nextAst, parsedLocal, targetIndex)
        : moveNestedAstNodeToRoot(nextAst, parsedLocal, targetIndex);
      if (ok) updateFormulaAst(nextAst);
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
    if (
      ifTemplate === "SI" ||
      ifTemplate === "BLOQUE" ||
      ifTemplate === "TOPE" ||
      ifTemplate === "CONSTANTE" ||
      ifTemplate.startsWith("MATH:")
    ) {
      if (
        ifTemplate === "SI" ||
        ifTemplate === "BLOQUE" ||
        ifTemplate === "TOPE"
      ) {
        insertBlockTemplateAt(ifTemplate as "SI" | "BLOQUE" | "TOPE", targetIndex);
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
      setTagModal({ open: true, tag: tagPayload, insertAt: targetIndex });
      setDragInsertIndex(null);
    }
  };

  const startEditTextToken = (tk: FormulaToken) => {
    setEditingTextTokenId(tk.id);
    setEditingTextDraft(tk.kind === "slot" ? stripSlotSuffix(tk.expression) : tk.label);
  };

  const commitTextTokenEdit = () => {
    if (!editingTextTokenId) return;
    const nextValue = editingTextDraft.trim();
    if (!nextValue) {
      updateFormulaTokens(selectedFormulaTokens.filter((item) => item.id !== editingTextTokenId));
    } else {
      updateFormulaTokens(
        selectedFormulaTokens.map((item) =>
          item.id === editingTextTokenId
            ? item.kind === "slot"
              ? { ...item, label: nextValue, expression: `${nextValue}${slotSuffixFor(item.expression)}` }
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
    updateFormulaTokens(selectedFormulaTokens.filter((item) => item.id !== editingTextTokenId));
    setEditingTextTokenId(null);
    setEditingTextDraft("");
  };

  const saveConstAtRoot = (tokenId: string) => {
    const value = editingConstDraft.trim();
    if (!value) {
      updateFormulaTokens(selectedFormulaTokens.filter((item) => item.id !== tokenId));
    } else {
      updateFormulaTokens(
        selectedFormulaTokens.map((item) =>
          item.id === tokenId
            ? { ...item, label: value, expression: buildConstExpression(value) }
            : item
        )
      );
    }
    setEditingConstTokenId(null);
    setEditingConstDraft("");
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

  const renderFunctionBlockEditor = (
    blockExpr: string,
    onChange: (next: string) => void,
    pathKey: string,
    level: number,
    onRemove?: () => void
  ): ReactNode =>
    createElement(FormulaBlockEditor, {
      blockExpr,
      onChange,
      pathKey,
      level,
      onRemove,
      conceptCodeById,
      scopePastelStyle: (functionName: string, depth: number) => {
        const normalized = functionName.trim().toUpperCase() || "FN";
        const hash = Array.from(normalized).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const hue = (hash * 37) % 360;
        const d = Math.max(0, depth);
        const bgLightness = Math.max(80, 96 - d * 4);
        const borderLightness = Math.max(68, 84 - d * 4);
        return {
          background: `hsl(${hue} 58% ${bgLightness}%)`,
          borderColor: `hsl(${hue} 36% ${borderLightness}%)`
        };
      },
      onDropToNestedArgAt,
      insertRawTextIntoNestedArg,
      mutateBlockArgTokens,
      setNestedDragSource,
      setCursorGhost,
      editingTextTokenId,
      setEditingTextTokenId,
      editingTextDraft,
      setEditingTextDraft,
      textTokenEditRef: textTokenEditRef as RefObject<HTMLDivElement>,
      editingConstTokenId,
      setEditingConstTokenId,
      editingConstDraft,
      setEditingConstDraft,
      isConstExpression,
      parseConstValue,
      buildConstExpression,
      isMathExpression,
      isTagAggregationExpression,
      conceptVisualForToken
    });

  const renderRootFormulaToken = (tk: FormulaToken): ReactNode =>
    createElement(RootFormulaTokenRenderer, {
      tk,
      setRootDragSource,
      setCursorGhost,
      setDraggingFormulaTokenId,
      setDragInsertIndex,
      draggingFormulaTokenId,
      renderFunctionBlockEditor,
      updateFormulaTokens,
      selectedFormulaTokens,
      editingTextTokenId,
      editingTextDraft,
      setEditingTextTokenId,
      setEditingTextDraft,
      textTokenEditRef,
      commitTextTokenEdit,
      removeEditingTextToken,
      startEditTextToken,
      editingConstTokenId,
      editingConstDraft,
      setEditingConstTokenId,
      setEditingConstDraft,
      saveConstAtRoot,
      isConstExpression,
      isMathExpression,
      isTagAggregationExpression,
      parseConstValue,
      conceptVisualForToken,
      getShapeGlyph
    });

  const setFormulaExpressionText = (nextExpression: string) => {
    updateFormulaTokens(tokenizeFormulaExpression(nextExpression, { conceptCodeById }));
  };

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
  }, [editingTextTokenId, editingTextDraft, selectedFormulaTokens]);

  useEffect(() => {
    setDragInsertIndex(null);
    setDraggingFormulaTokenId(null);
    setEditingTextTokenId(null);
    setEditingTextDraft("");
  }, [selectedConcept.id]);

  const triggerRootInsert = () => {
    setRootInsertSignal((v) => (v ?? 0) + 1);
  };

  return {
    dragInsertIndex,
    setDragInsertIndex,
    draggingFormulaTokenId,
    setDraggingFormulaTokenId,
    editingTextTokenId,
    setEditingTextTokenId,
    editingTextDraft,
    setEditingTextDraft,
    editingConstTokenId,
    setEditingConstTokenId,
    editingConstDraft,
    setEditingConstDraft,
    textTokenEditRef,
    rootInsertSignal,
    triggerRootInsert,
    updateFormulaTokens,
    updateFormulaAst,
    insertTokenAt,
    insertFromRawTextAt,
    insertBlockTemplateAt,
    setFormulaExpressionText,
    onTokenDropToFormula,
    startEditTextToken,
    commitTextTokenEdit,
    removeEditingTextToken,
    saveConstAtRoot,
    conceptVisualForToken,
    renderFunctionBlockEditor,
    renderRootFormulaToken,
    formulaExpressionText: formulaToExpression(selectedFormulaTokens)
  };
}
