import { DragEvent } from "react";
import { getShapeGlyph, token } from "../../model/helpers";
import { buildConstExpression } from "../../model/formula-ui";
import { ConceptModel } from "../../model/types";

interface FormulaToolsPanelProps {
  transitorios: ConceptModel[];
  allTags: string[];
  insertAt: number;
  onAddTransitory: () => void;
  onSelectConcept: (conceptId: number) => void;
  onInsertBlockTemplate: (name: "SI" | "BLOQUE" | "TOPE" | "VALOR_LEGAJO", index: number) => void;
  onInsertConst: (index: number) => void;
  onInsertMath: (op: string, index: number) => void;
  onOpenTagModal: (tag: string, insertAt: number) => void;
  setCursorGhost: (event: DragEvent<HTMLElement>, label: string) => void;
}

export function FormulaToolsPanel({
  transitorios,
  allTags,
  insertAt,
  onAddTransitory,
  onSelectConcept,
  onInsertBlockTemplate,
  onInsertConst,
  onInsertMath,
  onOpenTagModal,
  setCursorGhost
}: FormulaToolsPanelProps) {
  return (
    <article className="panel drawer">
      <h2>Herramientas</h2>

      <div className="drawer-header">
        <h3>Conceptos transitorios</h3>
        <button className="add-button" onClick={onAddTransitory}>
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
              e.dataTransfer.setData("text/plain", concept.code);
              setCursorGhost(e, concept.code);
              e.dataTransfer.setData(
                "text/token-json",
                JSON.stringify(token(concept.code, `CCONCEPTO("${concept.code}")`, "concept"))
              );
            }}
            onClick={() => onSelectConcept(concept.id)}
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
        {(["SI", "BLOQUE", "TOPE", "VALOR_LEGAJO"] as const).map((fn) => (
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
    </article>
  );
}
