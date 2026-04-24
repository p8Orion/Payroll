import { DragEvent, ReactNode } from "react";
import { FormulaInlineEditor } from "../../components/FormulaInlineEditor";
import { FormulaToken } from "../../model/types";

interface FormulaEditorSectionProps {
  tokens: FormulaToken[];
  rootInsertSignal?: number;
  onInsertAt: (rawValue: string, insertAt: number) => void;
  onDropToFormula: (event: DragEvent<HTMLElement>, insertAt?: number) => void;
  onTriggerRootInsert: () => void;
  renderRootToken: (token: FormulaToken, index: number) => ReactNode;
  formulaText: string;
  onFormulaTextChange: (value: string) => void;
  previewValue: unknown | null;
  previewError: string | null;
  hasCycle: boolean;
}

export function FormulaEditorSection({
  tokens,
  rootInsertSignal,
  onInsertAt,
  onDropToFormula,
  onTriggerRootInsert,
  renderRootToken,
  formulaText,
  onFormulaTextChange,
  previewValue,
  previewError,
  hasCycle
}: FormulaEditorSectionProps) {
  const formatPreviewValue = (value: unknown): string =>
    typeof value === "number" ? `$${value.toLocaleString("es-AR")}` : String(value);

  return (
    <>
      <div
        className="formula-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => onDropToFormula(e)}
        onDoubleClick={(e) => {
          if (e.target !== e.currentTarget) return;
          onTriggerRootInsert();
        }}
      >
        <FormulaInlineEditor
          tokens={tokens}
          onInsertAt={onInsertAt}
          openInsertAtEndSignal={rootInsertSignal}
          onDropAt={(e, insertAt) => onDropToFormula(e, insertAt)}
          onEmptyDrop={(e) => onDropToFormula(e, 0)}
          renderToken={(tk, index) => renderRootToken(tk, index)}
        />
      </div>
      <div className="formula-text-section">
        <h3>Formula</h3>
        <input
          className="formula-text-live-input"
          value={formulaText}
          onChange={(e) => onFormulaTextChange(e.target.value)}
          placeholder='Ej: CCONCEPTO("BASICO") MATH("*") PARAM("porc_antiguedad")'
        />
      </div>
      <div className="preview">
        <h3>Pre-calculo de prueba</h3>
        <p>
          <strong>
            {hasCycle
              ? "Error (ciclo DAG)"
              : previewValue === null
                ? `Error: ${previewError ?? "error de compilacion"}`
                : formatPreviewValue(previewValue)}
          </strong>
        </p>
      </div>
    </>
  );
}
