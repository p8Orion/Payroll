import { DragEvent, ReactNode, RefObject } from "react";
import { buildConstExpression } from "../../model/formula-ui";
import { token, getShapeGlyph } from "../../model/helpers";
import {
  CONCEPT_TYPE_DEFINITIONS,
  ConceptModel,
  ConceptShape,
  ConceptTypeId,
  F1359FieldModel,
  FormulaToken,
  getConceptTypeDefinition
} from "../../model/types";
import { FormulaEditorSection } from "../formula-editor/FormulaEditorSection";
import { FormulaToolsPanel } from "../formula-editor/FormulaToolsPanel";
import { LegajoModel } from "../legajos/LegajosPage";

interface ReceiptEditorWorkspaceProps {
  receiptConvenioFilter: string;
  setReceiptConvenioFilter: (value: string) => void;
  convenios: string[];
  receiptLiquidationTypeFilter: string;
  setReceiptLiquidationTypeFilter: (value: string) => void;
  receiptLiquidationTypeOptions: string[];
  receiptF1359Filter: string;
  setReceiptF1359Filter: (value: string) => void;
  f1359Fields: F1359FieldModel[];
  receiptTagFilter: string;
  setReceiptTagFilter: (value: string) => void;
  allTags: string[];
  simLegajoId: string;
  setSimLegajoId: (value: string) => void;
  simLegajosForConvenio: LegajoModel[];
  simMonth: number;
  setSimMonth: (value: number) => void;
  simulationMonthOptions: ReadonlyArray<{ value: number; label: string }>;
  simYear: number;
  setSimYear: (value: number) => void;
  addDefinitiveToReceipt: () => void;
  showReceiptConceptDetail: boolean;
  setShowReceiptConceptDetail: React.Dispatch<React.SetStateAction<boolean>>;
  definitivosEnReciboFiltrados: ConceptModel[];
  setEditingId: (id: number) => void;
  setCursorGhost: (event: DragEvent<HTMLElement>, label: string) => void;
  reorderDefinitivo: (dragId: number, dropId: number) => void;
  selectedConcept: ConceptModel;
  hidePrecalculationPreview: boolean;
  cycleConceptIds: Set<number>;
  formulaErrorById: Map<number, boolean>;
  dagOrderById: Map<number, number>;
  formatPreviewAmount: (value: unknown) => string;
  previewValueById: Map<number, unknown>;
  addTransitory: () => void;
  transitoriosEnReciboFiltrados: ConceptModel[];
  conceptCodeDraft: string;
  updateSelectedConceptCode: (value: string) => void;
  conceptNameDraft: string;
  updateSelectedConceptName: (value: string) => void;
  deleteSelectedConcept: () => void;
  appearanceRef: RefObject<HTMLDivElement | null>;
  appearanceOpen: boolean;
  setAppearanceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  updateSelectedAppearance: (patch: { color?: string; shape?: ConceptShape }) => void;
  colorPalette30: string[];
  membershipTypeComboRef: RefObject<HTMLDivElement | null>;
  membershipTypeDropdownOpen: boolean;
  setMembershipTypeDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMembershipConvenioDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  membershipLiquidationTypeOptions: string[];
  conceptReceiptMembership: Array<{ liquidationType: string; convenio: string; belongs: boolean }>;
  setSelectedConceptMembershipByLiquidationType: (liquidationType: string, shouldBelong: boolean) => void;
  membershipConvenioComboRef: RefObject<HTMLDivElement | null>;
  membershipConvenioDropdownOpen: boolean;
  membershipConvenioOptions: string[];
  setSelectedConceptMembershipByConvenio: (convenio: string, shouldBelong: boolean) => void;
  conceptTypeDraft: ConceptTypeId;
  updateSelectedConceptType: (value: ConceptTypeId) => void;
  updateSelectedConceptF1359Field: (fieldId: string) => void;
  newTagDraft: string;
  handleTagDraftChange: (value: string) => void;
  addTagToSelectedConcept: (value: string) => void;
  filteredTagSuggestions: string[];
  removeTagFromSelectedConcept: (tagToRemove: string) => void;
  implicitTypeTagValues: Set<string>;
  selectedFormulaTokens: FormulaToken[];
  rootInsertSignal?: number;
  insertFromRawTextAt: (rawValue: string, index: number) => void;
  onTokenDropToFormula: (event: DragEvent<HTMLElement>, insertAt?: number) => void;
  triggerRootInsert: () => void;
  renderRootFormulaToken: (token: FormulaToken, index: number) => ReactNode;
  formulaExpressionText: string;
  setFormulaExpressionText: (value: string) => void;
  previewInfo: { value: unknown | null; error: string | null };
  fixedValueKeys: string[];
  insertBlockTemplateAt: (name: "SI" | "BLOQUE" | "TOPE" | "MES_ANTERIOR" | "SUMA_ANUAL", index: number) => void;
  insertTokenAt: (token: FormulaToken, index: number) => void;
  setTagModal: React.Dispatch<React.SetStateAction<{ open: boolean; tag: string; insertAt: number }>>;
}

export function ReceiptEditorWorkspace(props: ReceiptEditorWorkspaceProps) {
  const {
    receiptConvenioFilter,
    setReceiptConvenioFilter,
    convenios,
    receiptLiquidationTypeFilter,
    setReceiptLiquidationTypeFilter,
    receiptLiquidationTypeOptions,
    receiptF1359Filter,
    setReceiptF1359Filter,
    f1359Fields,
    receiptTagFilter,
    setReceiptTagFilter,
    allTags,
    simLegajoId,
    setSimLegajoId,
    simLegajosForConvenio,
    simMonth,
    setSimMonth,
    simulationMonthOptions,
    simYear,
    setSimYear,
    addDefinitiveToReceipt,
    showReceiptConceptDetail,
    setShowReceiptConceptDetail,
    definitivosEnReciboFiltrados,
    setEditingId,
    setCursorGhost,
    reorderDefinitivo,
    selectedConcept,
    hidePrecalculationPreview,
    cycleConceptIds,
    formulaErrorById,
    dagOrderById,
    formatPreviewAmount,
    previewValueById,
    addTransitory,
    transitoriosEnReciboFiltrados,
    conceptCodeDraft,
    updateSelectedConceptCode,
    conceptNameDraft,
    updateSelectedConceptName,
    deleteSelectedConcept,
    appearanceRef,
    appearanceOpen,
    setAppearanceOpen,
    updateSelectedAppearance,
    colorPalette30,
    membershipTypeComboRef,
    membershipTypeDropdownOpen,
    setMembershipTypeDropdownOpen,
    setMembershipConvenioDropdownOpen,
    membershipLiquidationTypeOptions,
    conceptReceiptMembership,
    setSelectedConceptMembershipByLiquidationType,
    membershipConvenioComboRef,
    membershipConvenioDropdownOpen,
    membershipConvenioOptions,
    setSelectedConceptMembershipByConvenio,
    conceptTypeDraft,
    updateSelectedConceptType,
    updateSelectedConceptF1359Field,
    newTagDraft,
    handleTagDraftChange,
    addTagToSelectedConcept,
    filteredTagSuggestions,
    removeTagFromSelectedConcept,
    implicitTypeTagValues,
    selectedFormulaTokens,
    rootInsertSignal,
    insertFromRawTextAt,
    onTokenDropToFormula,
    triggerRootInsert,
    renderRootFormulaToken,
    formulaExpressionText,
    setFormulaExpressionText,
    previewInfo,
    fixedValueKeys,
    insertBlockTemplateAt,
    insertTokenAt,
    setTagModal
  } = props;

  return (
    <section className="modelo-grid">
      <article className="panel concept-panel">
        <h2>Editor de Recibo</h2>
        <div className="receipt-toolbar">
          <div>
            <label htmlFor="convenio">Convenio</label>
            <select id="convenio" value={receiptConvenioFilter} onChange={(e) => setReceiptConvenioFilter(e.target.value)}>
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
              onChange={(e) => setReceiptLiquidationTypeFilter(e.target.value)}
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
            <select id="f1359-filter" value={receiptF1359Filter} onChange={(e) => setReceiptF1359Filter(e.target.value)}>
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
            <select id="receipt-tag-filter" value={receiptTagFilter} onChange={(e) => setReceiptTagFilter(e.target.value)}>
              <option value="">Sin filtro</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="receipt-toolbar receipt-simulation-toolbar" style={{ marginTop: 8, borderTop: "1px dashed #d5deee", paddingTop: 10 }}>
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
            <select id="sim-month" value={simMonth} onChange={(e) => setSimMonth(Number(e.target.value))}>
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
          <button type="button" className="save-inline-button" onClick={() => setShowReceiptConceptDetail((prev) => !prev)}>
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
                e.dataTransfer.setData("text/token-json", JSON.stringify(token(concept.code, `CONCEPTO(${concept.id})`, "concept")));
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
                <span className="concept-type-inline">{getConceptTypeDefinition(concept.conceptType).label}</span>
                {showReceiptConceptDetail ? (
                  <span className="concept-meta-inline">
                    {!hidePrecalculationPreview ? (
                      <>
                        {cycleConceptIds.has(concept.id) ? <span className="concept-error-inline">CICLO</span> : null}
                        {formulaErrorById.get(concept.id) ? <span className="concept-error-inline">ERROR</span> : null}
                        #{dagOrderById.get(concept.id) ?? "-"} · {formatPreviewAmount(previewValueById.get(concept.id) ?? 0)} ·{" "}
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
                  JSON.stringify(token(concept.code, `CCONCEPTO("${concept.code}")`, "concept"))
                );
              }}
              className={concept.id === selectedConcept.id ? "concept-item transitorio-item selected" : "concept-item transitorio-item"}
            >
              <div>
                <span className="concept-marker" style={{ color: concept.color }}>
                  {getShapeGlyph(concept.shape)}
                </span>
                <strong>{concept.code}</strong> - {concept.name}
                <span className="concept-type-inline">{getConceptTypeDefinition(concept.conceptType).label}</span>
                {showReceiptConceptDetail ? (
                  <span className="concept-meta-inline">
                    {!hidePrecalculationPreview ? (
                      <>
                        {cycleConceptIds.has(concept.id) ? <span className="concept-error-inline">CICLO</span> : null}
                        {formulaErrorById.get(concept.id) ? <span className="concept-error-inline">ERROR</span> : null}
                        #{dagOrderById.get(concept.id) ?? "-"} · {formatPreviewAmount(previewValueById.get(concept.id) ?? 0)} ·{" "}
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
            <button type="button" className="remove-inline-button concept-delete-button" onClick={deleteSelectedConcept} title="Eliminar concepto">
              🗑
            </button>
          </div>
          <div className="appearance-selector" ref={appearanceRef}>
            <button className="appearance-trigger" onClick={() => setAppearanceOpen((old) => !old)} type="button" title="Editar apariencia">
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
                      [
                        "circle",
                        "square",
                        "star",
                        "triangle",
                        "diamond",
                        "plus",
                        "moon",
                        "clover",
                        "xmark",
                        "exclamation",
                        "question",
                        "bolt"
                      ] as Exclude<ConceptShape, "hex">[]
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
                        const rows = conceptReceiptMembership.filter((item) => item.liquidationType === liquidationType);
                        const checked = rows.some((item) => item.belongs);
                        return (
                          <li key={`${selectedConcept.id}-liq-${liquidationType}`} className="concept-item">
                            <label style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => setSelectedConceptMembershipByLiquidationType(liquidationType, e.target.checked)}
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
                                onChange={(e) => setSelectedConceptMembershipByConvenio(convenio, e.target.checked)}
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
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #c9d4ea", background: "#fff" }}
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
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #c9d4ea", background: "#fff" }}
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
                    <button className="tag-remove-inline" onClick={() => removeTagFromSelectedConcept(tag)} title="Quitar tag">
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
        onInsertConst={(index) => insertTokenAt(token("const", buildConstExpression("0"), "function"), index)}
        onInsertAntiguedad={(index) => insertTokenAt(token("Antigüedad", "ANTIGUEDAD()", "function"), index)}
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
  );
}
