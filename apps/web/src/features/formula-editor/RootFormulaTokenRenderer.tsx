import { Dispatch, DragEvent, ReactNode, RefObject, SetStateAction } from "react";
import { ConceptModel, ConceptShape, FormulaToken } from "../../model/types";

interface RootFormulaTokenRendererProps {
  tk: FormulaToken;
  setRootDragSource: (tokenId: string) => void;
  setCursorGhost: (event: DragEvent<HTMLElement>, label: string) => void;
  setDraggingFormulaTokenId: Dispatch<SetStateAction<string | null>>;
  setDragInsertIndex: Dispatch<SetStateAction<number | null>>;
  draggingFormulaTokenId: string | null;
  renderFunctionBlockEditor: (
    blockExpr: string,
    onChange: (next: string) => void,
    pathKey: string,
    level: number,
    onRemove?: () => void
  ) => ReactNode;
  updateFormulaTokens: (tokens: FormulaToken[]) => void;
  selectedFormulaTokens: FormulaToken[];
  editingTextTokenId: string | null;
  editingTextDraft: string;
  setEditingTextTokenId: Dispatch<SetStateAction<string | null>>;
  setEditingTextDraft: Dispatch<SetStateAction<string>>;
  textTokenEditRef: RefObject<HTMLDivElement | null>;
  commitTextTokenEdit: () => void;
  removeEditingTextToken: () => void;
  startEditTextToken: (tk: FormulaToken) => void;
  editingConstTokenId: string | null;
  editingConstDraft: string;
  setEditingConstTokenId: Dispatch<SetStateAction<string | null>>;
  setEditingConstDraft: Dispatch<SetStateAction<string>>;
  saveConstAtRoot: (tokenId: string) => void;
  isConstExpression: (expr: string) => boolean;
  isMathExpression: (expr: string) => boolean;
  isTagAggregationExpression: (expr: string) => boolean;
  parseConstValue: (expr: string) => string;
  conceptVisualForToken: (tk: FormulaToken) => ConceptModel | null;
  getShapeGlyph: (shape: ConceptShape) => string;
  getPillTitle?: (tk: FormulaToken) => string | null;
  onConceptClick?: (tk: FormulaToken) => void;
  onShowGananciasInfo?: () => void;
}

export function RootFormulaTokenRenderer({
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
  getShapeGlyph,
  getPillTitle,
  onConceptClick,
  onShowGananciasInfo
}: RootFormulaTokenRendererProps) {
  if (tk.kind === "block") {
    return (
      <div
        className="formula-block-token"
        title={getPillTitle?.(tk) ?? "Click der: quitar"}
        draggable
        onDragStart={(e) => {
          setRootDragSource(tk.id);
          e.dataTransfer.setData("text/plain", tk.label);
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
          (nextExpr: string) => {
            updateFormulaTokens(
              selectedFormulaTokens.map((item) =>
                item.id === tk.id ? { ...item, expression: nextExpr } : item
              )
            );
          },
          tk.id,
          0,
          () => {
            updateFormulaTokens(selectedFormulaTokens.filter((item) => item.id !== tk.id));
          }
        )}
      </div>
    );
  }

  if (tk.kind === "text") {
    if (editingTextTokenId === tk.id) {
      return (
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
          <button className="text-token-remove-float" onClick={removeEditingTextToken} title="Borrar texto">
            -
          </button>
        </div>
      );
    }
    return (
      <span
        className="formula-text"
        draggable
        onDragStart={(e) => {
          setRootDragSource(tk.id);
          e.dataTransfer.setData("text/plain", tk.label);
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
          updateFormulaTokens(selectedFormulaTokens.filter((item) => item.id !== tk.id));
        }}
        title="Click para editar"
        style={{ opacity: draggingFormulaTokenId === tk.id ? 0.12 : 1 }}
      >
        {tk.label}
      </span>
    );
  }

  if (isConstExpression(tk.expression) && editingConstTokenId === tk.id) {
    return (
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
    );
  }

  const isGananciasToken = tk.expression.trim().toUpperCase() === "GANANCIAS()";

  return (
    <span className="formula-pill-wrap">
      <button
        className={`formula-pill ${tk.kind}${
        isConstExpression(tk.expression)
          ? " const-pill"
          : isMathExpression(tk.expression)
            ? " math-pill"
            : isTagAggregationExpression(tk.expression)
              ? " tag-pill"
              : /^VALOR_(?:FIJO|LEGAJO)\("/.test(tk.expression)
                ? " fixed-value-pill"
              : isGananciasToken
                ? " ganancias-pill"
              : ""
        }`}
        draggable
        onDragStart={(e) => {
          setRootDragSource(tk.id);
          e.dataTransfer.setData("text/plain", tk.label);
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
          if (tk.kind === "concept") {
            onConceptClick?.(tk);
            return;
          }
          if (isConstExpression(tk.expression)) {
            setEditingConstTokenId(tk.id);
            setEditingConstDraft(parseConstValue(tk.expression));
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          updateFormulaTokens(selectedFormulaTokens.filter((item) => item.id !== tk.id));
        }}
        title={
          getPillTitle?.(tk) ??
          (isConstExpression(tk.expression) ? "Click izq: editar constante. Click der: quitar" : "Click der: quitar")
        }
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
      {isGananciasToken ? (
        <button
          type="button"
          className="formula-pill-info"
          title="Ver explicación de Ganancias"
          aria-label="Ver explicación de Ganancias"
          onClick={(e) => {
            e.stopPropagation();
            onShowGananciasInfo?.();
          }}
        >
          i
        </button>
      ) : null}
    </span>
  );
}
