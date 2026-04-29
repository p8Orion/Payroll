import { DragEvent } from "react";
import { token } from "../../model/helpers";
import { buildConstExpression } from "../../model/formula-ui";

interface FormulaToolsPanelProps {
  allTags: string[];
  fixedValueKeys: string[];
  insertAt: number;
  onInsertBlockTemplate: (name: "SI" | "BLOQUE" | "TOPE", index: number) => void;
  onInsertConst: (index: number) => void;
  onInsertAntiguedad: (index: number) => void;
  onInsertAnteriores: (index: number) => void;
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
  onInsertAntiguedad,
  onInsertAnteriores,
  onInsertFixedValue,
  onInsertMath,
  onOpenTagModal,
  setCursorGhost
}: FormulaToolsPanelProps) {
  const functionItems: Array<{
    label: string;
    onClick: () => void;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
  }> = [
    {
      label: "ANTERIORES",
      onClick: () => onInsertAnteriores(insertAt),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", "ANTERIORES");
        setCursorGhost(e, "ANTERIORES");
        e.dataTransfer.setData(
          "text/token-json",
          JSON.stringify(token("Suma de Anteriores", "ANTERIORES()", "function"))
        );
      }
    },
    {
      label: "ANTIGÜEDAD",
      onClick: () => onInsertAntiguedad(insertAt),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", "ANTIGUEDAD");
        setCursorGhost(e, "ANTIGUEDAD");
        e.dataTransfer.setData(
          "text/token-json",
          JSON.stringify(token("Antigüedad", "ANTIGUEDAD()", "function"))
        );
      }
    },
    {
      label: "BLOQUE",
      onClick: () => onInsertBlockTemplate("BLOQUE", insertAt),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", "BLOQUE");
        setCursorGhost(e, "BLOQUE");
        e.dataTransfer.setData("text/function-template", "BLOQUE");
      }
    },
    {
      label: "CONSTANTE",
      onClick: () => onInsertConst(insertAt),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", "CONSTANTE");
        setCursorGhost(e, "CONSTANTE");
        e.dataTransfer.setData("text/function-template", "CONSTANTE");
        e.dataTransfer.setData(
          "text/token-json",
          JSON.stringify(token("0", buildConstExpression("0"), "function"))
        );
      }
    },
    {
      label: "SI",
      onClick: () => onInsertBlockTemplate("SI", insertAt),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", "SI");
        setCursorGhost(e, "SI");
        e.dataTransfer.setData("text/function-template", "SI");
      }
    },
    {
      label: "TOPE",
      onClick: () => onInsertBlockTemplate("TOPE", insertAt),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", "TOPE");
        setCursorGhost(e, "TOPE");
        e.dataTransfer.setData("text/function-template", "TOPE");
      }
    }
  ].sort((a, b) => a.label.localeCompare(b.label, "es"));
  const sortedTags = [...allTags].sort((a, b) => a.localeCompare(b, "es"));
  const sortedFixedValueKeys = [...fixedValueKeys].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <article className="panel drawer">
      <h2>Herramientas</h2>

      <h3>Funciones</h3>
      <div className="chip-wrap">
        {functionItems.map((fn) => (
          <button
            key={fn.label}
            className="chip"
            draggable
            onDragStart={fn.onDragStart}
            onClick={fn.onClick}
          >
            {fn.label}
          </button>
        ))}
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
        {sortedTags.map((tag) => (
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
        {sortedFixedValueKeys.map((key) => (
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
