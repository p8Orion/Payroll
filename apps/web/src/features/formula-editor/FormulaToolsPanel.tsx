import { DragEvent } from "react";
import { token } from "../../model/helpers";
import { buildConstExpression } from "../../model/formula-ui";

interface FormulaToolsPanelProps {
  allTags: string[];
  fixedValueKeys: string[];
  insertAt: number;
  onInsertBlockTemplate: (name: "SI" | "BLOQUE" | "TOPE", index: number) => void;
  onInsertConst: (index: number) => void;
  onInsertFixedValue: (key: string, index: number) => void;
  onInsertMath: (op: string, index: number) => void;
  onOpenTagModal: (tag: string, insertAt: number) => void;
  setCursorGhost: (event: DragEvent<HTMLElement>, label: string) => void;
}

export function FormulaToolsPanel({
  allTags,
  fixedValueKeys,
  insertAt,
  onInsertBlockTemplate,
  onInsertConst,
  onInsertFixedValue,
  onInsertMath,
  onOpenTagModal,
  setCursorGhost
}: FormulaToolsPanelProps) {
  return (
    <article className="panel drawer">
      <h2>Herramientas</h2>

      <h3>Funciones</h3>
      <div className="chip-wrap">
        {(["SI", "BLOQUE", "TOPE"] as const).map((fn) => (
          <button
            key={fn}
            className="chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copyMove";
              e.dataTransfer.setData("text/plain", fn);
              setCursorGhost(e, fn);
              e.dataTransfer.setData("text/function-template", fn);
            }}
            onClick={() => onInsertBlockTemplate(fn, insertAt)}
          >
            {fn}
          </button>
        ))}
        <button
          className="chip"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copyMove";
            e.dataTransfer.setData("text/plain", "CONSTANTE");
            setCursorGhost(e, "CONSTANTE");
            e.dataTransfer.setData("text/function-template", "CONSTANTE");
            e.dataTransfer.setData(
              "text/token-json",
              JSON.stringify(token("0", buildConstExpression("0"), "function"))
            );
          }}
          onClick={() => onInsertConst(insertAt)}
        >
          CONSTANTE
        </button>
      </div>

      <h3>Funciones matematicas</h3>
      <div className="chip-wrap">
        {["+", "-", "*", "/", "%", ">", "<", ">=", "<=", "=", "<>"].map((op) => (
          <button
            key={op}
            className="chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copyMove";
              e.dataTransfer.setData("text/plain", op);
              setCursorGhost(e, op);
              e.dataTransfer.setData("text/function-template", `MATH:${op}`);
              e.dataTransfer.setData("text/token-json", JSON.stringify(token(op, `MATH("${op}")`, "function")));
            }}
            onClick={() => onInsertMath(op, insertAt)}
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
              e.dataTransfer.setData("text/plain", `#${tag}`);
              setCursorGhost(e, `#${tag}`);
              e.dataTransfer.setData("text/tag-name", tag);
            }}
            onClick={() => onOpenTagModal(tag, insertAt)}
          >
            #{tag}
          </button>
        ))}
      </div>

      <h3>Valores fijos</h3>
      <div className="chip-wrap">
        {fixedValueKeys.map((key) => (
          <button
            key={key}
            className="chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copyMove";
              e.dataTransfer.setData("text/plain", key);
              setCursorGhost(e, key);
              e.dataTransfer.setData(
                "text/token-json",
                JSON.stringify(token(`Valor Fijo ${key}`, `VALOR_FIJO("${key}")`, "function"))
              );
            }}
            onClick={() => onInsertFixedValue(key, insertAt)}
          >
            {key}
          </button>
        ))}
      </div>
    </article>
  );
}
