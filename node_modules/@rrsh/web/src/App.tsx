import { Dispatch, DragEvent, SetStateAction, useEffect, useMemo, useState } from "react";
import "./App.css";
import { colorPalette30, shapeCycle } from "./model/constants";
import { formulaToExpression, getShapeGlyph, token } from "./model/helpers";
import {
  type FunctionBlockModel
} from "./model/function-blocks";
import { astToTokens } from "./model/formula-dnd";
import { useFormulaDragSource } from "./hooks/useFormulaDragSource";
import {
  buildConstExpression
} from "./model/formula-ui";
import { useFormulaEditor } from "./features/formula-editor/useFormulaEditor";
import { FormulaEditorSection } from "./features/formula-editor/FormulaEditorSection";
import { FormulaToolsPanel } from "./features/formula-editor/FormulaToolsPanel";
import { ReceiptEditorWorkspace } from "./features/receipt-editor/ReceiptEditorWorkspace";
import { useEditorHistory } from "./features/receipt-editor/useEditorHistory";
import { useReceiptEditorDataSync } from "./features/receipt-editor/useReceiptEditorDataSync";
import { useFormulaPillPreview } from "./features/receipt-editor/useFormulaPillPreview";
import { useReceiptEditorUiState } from "./features/receipt-editor/useReceiptEditorUiState";
import { useReceiptEditorActions } from "./features/receipt-editor/useReceiptEditorActions";
import { useReceiptEditorController } from "./features/receipt-editor/useReceiptEditorController";
import { AppTopbar } from "./features/topbar/AppTopbar";
import { useTopbarMenu } from "./features/topbar/useTopbarMenu";
import {
  apiBaseUrl,
  defaultConvenios,
  filterAllOption,
  annualAllLiquidationTypes,
  simulationMonthOptions,
  implicitTypeTagValues,
  implicitTagForType,
  normalizeTagsWithImplicitType,
  ensureReceiptMatrix,
  getValorLegajo as resolveValorLegajoFromSimulation,
  resolveComposicionLegajo,
  resolveValorLegajoConceptCode as resolveValorLegajoConceptCodeFromArg,
} from "./features/receipt-editor/receiptEditorUtils";
import { LegajoModel, LegajosPage } from "./features/legajos/LegajosPage";
import { LiquidacionesPage } from "./features/liquidaciones/LiquidacionesPage";
import { F1359InfoPage, HistoricalLiquidacionRecord } from "./features/informacion/F1359InfoPage";
import { GananciasTracePanel } from "./features/ganancias/GananciasTracePanel";
import {
  ComposicionSalarialModel,
  ComposicionesSalarialesPage
} from "./features/composiciones/ComposicionesSalarialesPage";
import { initialConcepts, initialReceipts } from "./model/seed";
import {
  CONCEPT_TYPE_DEFINITIONS,
  F1359FieldModel,
  ConceptShape,
  ConceptModel,
  ConceptTypeId,
  FormulaToken,
  LIQUIDATION_TYPES,
  LiquidationType,
  getConceptTypeDefinition,
  ReceiptModel,
  GananciasTableModel,
  TagAggregationOp
} from "./model/types";
import {
  evaluateConcepts,
  resolveAntiguedadYears,
  resolveMesAnteriorValue,
  resolveSumaAnualValue,
  toNumericOrZero
} from "./model/liquidation-eval";

export function App() {
  const {
    menu,
    setMenu,
    liquidacionesMenuOpen,
    setLiquidacionesMenuOpen,
    informacionMenuOpen,
    setInformacionMenuOpen,
    liquidacionesMenuRef,
    informacionMenuRef,
    setMenuFromLiquidaciones,
    setMenuFromInformacion
  } = useTopbarMenu();
  const [concepts, setConcepts] = useState<ConceptModel[]>(initialConcepts);
  const defaultReceiptOrder = useMemo(() => [] as number[], []);
  const [receipts, setReceipts] = useState<ReceiptModel[]>(() =>
    ensureReceiptMatrix(initialReceipts, defaultConvenios, [])
  );
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const {
    activeReceiptId,
    setActiveReceiptId,
    receiptConvenioFilter,
    setReceiptConvenioFilter,
    receiptLiquidationTypeFilter,
    setReceiptLiquidationTypeFilter,
    simLegajoId,
    setSimLegajoId,
    simMonth,
    setSimMonth,
    simYear,
    setSimYear,
    newTagDraft,
    setNewTagDraft,
    appearanceOpen,
    setAppearanceOpen,
    conceptCodeDraft,
    setConceptCodeDraft,
    conceptNameDraft,
    setConceptNameDraft,
    conceptTypeDraft,
    setConceptTypeDraft,
    membershipTypeDropdownOpen,
    setMembershipTypeDropdownOpen,
    membershipConvenioDropdownOpen,
    setMembershipConvenioDropdownOpen,
    showReceiptConceptDetail,
    setShowReceiptConceptDetail,
    receiptF1359Filter,
    setReceiptF1359Filter,
    receiptTagFilter,
    setReceiptTagFilter,
    appearanceRef,
    membershipTypeComboRef,
    membershipConvenioComboRef,
    tagModal,
    setTagModal
  } = useReceiptEditorUiState();
  const [convenioOptions, setConvenioOptions] = useState<string[]>(defaultConvenios);
  const [legajos, setLegajos] = useState<LegajoModel[]>(() => {
    return [];
  });
  const [composiciones, setComposiciones] = useState<ComposicionSalarialModel[]>([]);
  const [liquidacionesHistory, setLiquidacionesHistory] = useState<HistoricalLiquidacionRecord[]>([]);
  const [f1359Fields, setF1359Fields] = useState<F1359FieldModel[]>([]);
  const [gananciasTables, setGananciasTables] = useState<GananciasTableModel[]>([]);
  const [gananciasInfoModalOpen, setGananciasInfoModalOpen] = useState(false);
  const [conceptsLoaded, setConceptsLoaded] = useState(false);
  const [legajosLoaded, setLegajosLoaded] = useState(false);
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

  const definitivos = concepts.filter((c) => c.conceptClass === "definitivo");
  const convenios = useMemo(
    () =>
      Array.from(
        new Set([
          filterAllOption,
          ...convenioOptions,
          ...receipts.map((r) => r.convenio),
          receiptConvenioFilter
        ])
      ),
    [receipts, convenioOptions, receiptConvenioFilter]
  );
  useReceiptEditorDataSync({
    concepts,
    setConcepts,
    conceptsLoaded,
    setConceptsLoaded,
    receipts,
    setReceipts,
    receiptsLoaded,
    setReceiptsLoaded,
    convenios,
    defaultReceiptOrder,
    setConvenioOptions,
    legajos,
    setLegajos,
    legajosLoaded,
    setLegajosLoaded,
    composiciones,
    setComposiciones,
    setF1359Fields,
    receiptF1359Filter,
    receiptTagFilter,
    setLiquidacionesHistory,
    setGananciasTables
  });
  const {
    allTags,
    fixedValueKeys,
    filteredTagSuggestions,
    hidePrecalculationPreview,
    receiptLiquidationTypeOptions,
    simLegajosForConvenio,
    selectedConcept,
    editingId,
    setEditingId,
    conceptReceiptMembership,
    membershipConvenioOptions,
    membershipLiquidationTypeOptions,
    selectedFormulaTokens,
    rootInsertSignal,
    triggerRootInsert,
    insertTokenAt,
    insertFromRawTextAt,
    insertBlockTemplateAt,
    setFormulaExpressionText,
    onTokenDropToFormula,
    renderRootFormulaToken,
    formulaExpressionText,
    previewInfo,
    definitivosEnReciboFiltrados,
    transitoriosEnReciboFiltrados,
    dagOrderById,
    formulaErrorById,
    cycleConceptIds,
    previewValueById,
    gananciasTrace,
    formatPreviewAmount,
    actions: {
      reorderDefinitivo,
      addTransitory,
      addDefinitiveToReceipt,
      setSelectedConceptReceiptMembership,
      setSelectedConceptMembershipByLiquidationType,
      setSelectedConceptMembershipByConvenio,
      addTagToSelectedConcept,
      updateSelectedConceptCode,
      updateSelectedConceptName,
      updateSelectedConceptType,
      updateSelectedConceptF1359Field,
      deleteSelectedConcept,
      updateSelectedAppearance,
      removeTagFromSelectedConcept,
      handleTagDraftChange,
      applyTagAggregation
    }
  } = useReceiptEditorController({
    concepts,
    setConcepts,
    receipts,
    setReceipts,
    legajos,
    composiciones,
    liquidacionesHistory,
    gananciasTables,
    f1359Fields,
    receiptConvenioFilter,
    receiptLiquidationTypeFilter,
    receiptF1359Filter,
    receiptTagFilter,
    activeReceiptId,
    setActiveReceiptId,
    simLegajoId,
    setSimLegajoId,
    simMonth,
    simYear,
    conceptCodeDraft,
    setConceptCodeDraft,
    conceptNameDraft,
    setConceptNameDraft,
    conceptTypeDraft,
    setConceptTypeDraft,
    newTagDraft,
    setNewTagDraft,
    appearanceOpen,
    setAppearanceOpen,
    showReceiptConceptDetail,
    setShowReceiptConceptDetail,
    membershipTypeDropdownOpen,
    setMembershipTypeDropdownOpen,
    membershipConvenioDropdownOpen,
    setMembershipConvenioDropdownOpen,
    appearanceRef,
    membershipTypeComboRef,
    membershipConvenioComboRef,
    tagModal,
    setTagModal,
    setCursorGhost,
    onShowGananciasInfo: () => setGananciasInfoModalOpen(true)
  });
  const { undo, redo, canUndo, canRedo } = useEditorHistory({
    concepts,
    receipts,
    menu,
    activeReceiptId,
    editingId,
    conceptsLoaded,
    setConcepts,
    setReceipts,
    setMenu,
    setActiveReceiptId,
    setEditingId
  });

  return (
    <div className="layout">
      <AppTopbar
        menu={menu}
        setMenu={setMenu}
        liquidacionesMenuOpen={liquidacionesMenuOpen}
        setLiquidacionesMenuOpen={setLiquidacionesMenuOpen}
        informacionMenuOpen={informacionMenuOpen}
        setInformacionMenuOpen={setInformacionMenuOpen}
        liquidacionesMenuRef={liquidacionesMenuRef}
        informacionMenuRef={informacionMenuRef}
        setMenuFromLiquidaciones={setMenuFromLiquidaciones}
        setMenuFromInformacion={setMenuFromInformacion}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

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
            legajos={legajos}
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
            gananciasTables={gananciasTables}
            f1359Fields={f1359Fields}
          />
        ) : menu === "informacion-f1359" ? (
          <F1359InfoPage
            concepts={concepts}
            legajos={legajos}
            liquidaciones={liquidacionesHistory}
            f1359Fields={f1359Fields}
          />
        ) : menu !== "conceptos" ? (
          <section className="placeholder">
            <h2>{menu === "dashboard" ? "Dashboard" : menu === "novedades" ? "Novedades" : "Contable"}</h2>
            <p>Seccion en construccion. El foco de este MVP es Conceptos.</p>
          </section>
        ) : (
          <ReceiptEditorWorkspace
            receiptConvenioFilter={receiptConvenioFilter}
            setReceiptConvenioFilter={setReceiptConvenioFilter}
            convenios={convenios}
            receiptLiquidationTypeFilter={receiptLiquidationTypeFilter}
            setReceiptLiquidationTypeFilter={setReceiptLiquidationTypeFilter}
            receiptLiquidationTypeOptions={receiptLiquidationTypeOptions}
            receiptF1359Filter={receiptF1359Filter}
            setReceiptF1359Filter={setReceiptF1359Filter}
            f1359Fields={f1359Fields}
            receiptTagFilter={receiptTagFilter}
            setReceiptTagFilter={setReceiptTagFilter}
            allTags={allTags}
            simLegajoId={simLegajoId}
            setSimLegajoId={setSimLegajoId}
            simLegajosForConvenio={simLegajosForConvenio}
            simMonth={simMonth}
            setSimMonth={setSimMonth}
            simulationMonthOptions={simulationMonthOptions}
            simYear={simYear}
            setSimYear={setSimYear}
            addDefinitiveToReceipt={addDefinitiveToReceipt}
            showReceiptConceptDetail={showReceiptConceptDetail}
            setShowReceiptConceptDetail={setShowReceiptConceptDetail}
            definitivosEnReciboFiltrados={definitivosEnReciboFiltrados}
            setEditingId={setEditingId}
            setCursorGhost={setCursorGhost}
            reorderDefinitivo={reorderDefinitivo}
            selectedConcept={selectedConcept}
            hidePrecalculationPreview={hidePrecalculationPreview}
            cycleConceptIds={cycleConceptIds}
            formulaErrorById={formulaErrorById}
            dagOrderById={dagOrderById}
            formatPreviewAmount={formatPreviewAmount}
            previewValueById={previewValueById}
            gananciasTrace={gananciasTrace}
            addTransitory={addTransitory}
            transitoriosEnReciboFiltrados={transitoriosEnReciboFiltrados}
            conceptCodeDraft={conceptCodeDraft}
            updateSelectedConceptCode={updateSelectedConceptCode}
            conceptNameDraft={conceptNameDraft}
            updateSelectedConceptName={updateSelectedConceptName}
            deleteSelectedConcept={deleteSelectedConcept}
            appearanceRef={appearanceRef}
            appearanceOpen={appearanceOpen}
            setAppearanceOpen={setAppearanceOpen}
            updateSelectedAppearance={updateSelectedAppearance}
            colorPalette30={colorPalette30}
            membershipTypeComboRef={membershipTypeComboRef}
            membershipTypeDropdownOpen={membershipTypeDropdownOpen}
            setMembershipTypeDropdownOpen={setMembershipTypeDropdownOpen}
            setMembershipConvenioDropdownOpen={setMembershipConvenioDropdownOpen}
            membershipLiquidationTypeOptions={membershipLiquidationTypeOptions}
            conceptReceiptMembership={conceptReceiptMembership}
            setSelectedConceptMembershipByLiquidationType={setSelectedConceptMembershipByLiquidationType}
            membershipConvenioComboRef={membershipConvenioComboRef}
            membershipConvenioDropdownOpen={membershipConvenioDropdownOpen}
            membershipConvenioOptions={membershipConvenioOptions}
            setSelectedConceptMembershipByConvenio={setSelectedConceptMembershipByConvenio}
            conceptTypeDraft={conceptTypeDraft}
            updateSelectedConceptType={updateSelectedConceptType}
            updateSelectedConceptF1359Field={updateSelectedConceptF1359Field}
            newTagDraft={newTagDraft}
            handleTagDraftChange={handleTagDraftChange}
            addTagToSelectedConcept={addTagToSelectedConcept}
            filteredTagSuggestions={filteredTagSuggestions}
            removeTagFromSelectedConcept={removeTagFromSelectedConcept}
            implicitTypeTagValues={implicitTypeTagValues}
            selectedFormulaTokens={selectedFormulaTokens}
            rootInsertSignal={rootInsertSignal}
            insertFromRawTextAt={insertFromRawTextAt}
            onTokenDropToFormula={onTokenDropToFormula}
            triggerRootInsert={triggerRootInsert}
            renderRootFormulaToken={renderRootFormulaToken}
            formulaExpressionText={formulaExpressionText}
            setFormulaExpressionText={setFormulaExpressionText}
            previewInfo={previewInfo}
            fixedValueKeys={fixedValueKeys}
            insertBlockTemplateAt={insertBlockTemplateAt}
            insertTokenAt={insertTokenAt}
            setTagModal={setTagModal as Dispatch<SetStateAction<{ open: boolean; tag: string; insertAt: number }>>}
          />
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
      {gananciasInfoModalOpen && (
        <div className="modal-backdrop" onClick={() => setGananciasInfoModalOpen(false)}>
          <div className="modal-card ganancias-info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ganancias-info-modal-header">
              <h3>Información de Ganancias (simulada)</h3>
              <button type="button" className="close-modal-button" onClick={() => setGananciasInfoModalOpen(false)}>
                Cerrar
              </button>
            </div>
            <GananciasTracePanel
              trace={gananciasTrace}
              formatPreviewAmount={formatPreviewAmount}
              getF1359FieldLabel={(fieldId) => {
                const field = f1359Fields.find((item) => item.id === fieldId);
                if (!field) return fieldId;
                return `${field.id} - ${field.descripcion}`;
              }}
              collapsible={false}
              title="Explicación Ganancias (simulada)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
