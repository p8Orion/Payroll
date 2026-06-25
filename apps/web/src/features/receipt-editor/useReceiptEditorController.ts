import { Dispatch, DragEvent, SetStateAction, useMemo, useState } from "react";
import { astToTokens } from "../../model/formula-dnd";
import { formulaToExpression } from "../../model/helpers";
import { buildConstExpression } from "../../model/formula-ui";
import { useFormulaDragSource } from "../../hooks/useFormulaDragSource";
import { useFormulaEditor } from "../formula-editor/useFormulaEditor";
import { evaluateConcepts, resolveAntiguedadYears, resolveMesAnteriorValue, resolveSumaAnualValue, toNumericOrZero } from "../../model/liquidation-eval";
import { ConceptModel, ConceptTypeId, F1359FieldModel, FormulaToken, GananciasTableModel, ReceiptModel, TagAggregationOp } from "../../model/types";
import { ComposicionSalarialModel } from "../composiciones/ComposicionesSalarialesPage";
import { HistoricalLiquidacionRecord } from "../informacion/F1359InfoPage";
import { LegajoModel } from "../legajos/LegajosPage";
import { useFormulaPillPreview } from "./useFormulaPillPreview";
import { resolveComposicionLegajo, resolveValorLegajoConceptCode, getValorLegajo, filterAllOption, implicitTypeTagValues } from "./receiptEditorUtils";
import { useReceiptEditorActions } from "./useReceiptEditorActions";

type TagModalState = { open: boolean; tag: string; insertAt: number };

export function useReceiptEditorController(params: {
  concepts: ConceptModel[];
  setConcepts: Dispatch<SetStateAction<ConceptModel[]>>;
  receipts: ReceiptModel[];
  setReceipts: Dispatch<SetStateAction<ReceiptModel[]>>;
  legajos: LegajoModel[];
  composiciones: ComposicionSalarialModel[];
  liquidacionesHistory: HistoricalLiquidacionRecord[];
  gananciasTables: GananciasTableModel[];
  f1359Fields: F1359FieldModel[];
  receiptConvenioFilter: string;
  receiptLiquidationTypeFilter: string;
  receiptF1359Filter: string;
  receiptTagFilter: string;
  activeReceiptId: string;
  setActiveReceiptId: Dispatch<SetStateAction<string>>;
  simLegajoId: string;
  setSimLegajoId: Dispatch<SetStateAction<string>>;
  simMonth: number;
  simYear: number;
  conceptCodeDraft: string;
  setConceptCodeDraft: Dispatch<SetStateAction<string>>;
  conceptNameDraft: string;
  setConceptNameDraft: Dispatch<SetStateAction<string>>;
  conceptTypeDraft: ConceptTypeId | "";
  setConceptTypeDraft: Dispatch<SetStateAction<ConceptTypeId | "">>;
  newTagDraft: string;
  setNewTagDraft: Dispatch<SetStateAction<string>>;
  appearanceOpen: boolean;
  setAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  showReceiptConceptDetail: boolean;
  setShowReceiptConceptDetail: Dispatch<SetStateAction<boolean>>;
  membershipTypeDropdownOpen: boolean;
  setMembershipTypeDropdownOpen: Dispatch<SetStateAction<boolean>>;
  membershipConvenioDropdownOpen: boolean;
  setMembershipConvenioDropdownOpen: Dispatch<SetStateAction<boolean>>;
  appearanceRef: React.RefObject<HTMLDivElement | null>;
  membershipTypeComboRef: React.RefObject<HTMLDivElement | null>;
  membershipConvenioComboRef: React.RefObject<HTMLDivElement | null>;
  tagModal: TagModalState;
  setTagModal: Dispatch<SetStateAction<TagModalState>>;
  setCursorGhost: (event: DragEvent<HTMLElement>, label: string) => void;
  onShowGananciasInfo?: () => void;
}) {
  const {
    concepts, setConcepts, receipts, setReceipts, legajos, composiciones, liquidacionesHistory, gananciasTables, f1359Fields,
    receiptConvenioFilter, receiptLiquidationTypeFilter, receiptF1359Filter, receiptTagFilter, activeReceiptId, setActiveReceiptId,
    simLegajoId, setSimLegajoId, simMonth, simYear, conceptCodeDraft, setConceptCodeDraft, conceptNameDraft, setConceptNameDraft,
    conceptTypeDraft, setConceptTypeDraft, newTagDraft, setNewTagDraft, appearanceOpen, setAppearanceOpen, showReceiptConceptDetail,
    setShowReceiptConceptDetail, membershipTypeDropdownOpen, setMembershipTypeDropdownOpen, membershipConvenioDropdownOpen,
    setMembershipConvenioDropdownOpen, appearanceRef, membershipTypeComboRef, membershipConvenioComboRef, tagModal, setTagModal, setCursorGhost,
    onShowGananciasInfo
  } = params;

  const [editingId, setEditingId] = useState<number>(concepts.find((c) => c.conceptClass === "definitivo")?.id ?? concepts[0]?.id ?? 1);
  const conceptCodeById = useMemo(() => Object.fromEntries(concepts.map((c) => [c.id, c.code])) as Record<number, string>, [concepts]);
  const allTags = [...new Set(concepts.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  const filteredTagSuggestions = allTags.filter((tag) => !implicitTypeTagValues.has(tag) && tag.toLowerCase().includes(newTagDraft.trim().toLowerCase()));
  const fixedValueKeys = useMemo(() => Array.from(new Set([
    ...legajos.flatMap((l) => (l.valoresFijos ?? []).map((vf) => (vf.clave ?? "").trim())),
    ...composiciones.flatMap((c) => (c.valoresFijos ?? []).map((vf) => (vf.clave ?? "").trim()))
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b)), [legajos, composiciones]);

  const receiptsByConvenio = useMemo(() => receiptConvenioFilter === filterAllOption ? receipts : receipts.filter((r) => r.convenio === receiptConvenioFilter), [receipts, receiptConvenioFilter]);
  const receiptLiquidationTypeOptions = useMemo(() => Array.from(new Set([filterAllOption, ...receiptsByConvenio.map((receipt) => receipt.liquidationType)])), [receiptsByConvenio]);
  const receiptsByScreenFilter = useMemo(() => receiptLiquidationTypeFilter === filterAllOption ? receiptsByConvenio : receiptsByConvenio.filter((receipt) => receipt.liquidationType === receiptLiquidationTypeFilter), [receiptsByConvenio, receiptLiquidationTypeFilter]);
  const hidePrecalculationPreview = receiptConvenioFilter === filterAllOption || receiptLiquidationTypeFilter === filterAllOption;
  const activeReceipt = receipts.find((r) => r.id === activeReceiptId) ?? receiptsByScreenFilter[0] ?? receipts[0];
  const simLegajo = useMemo(() => legajos.find((l) => l.id === simLegajoId) ?? legajos[0] ?? null, [legajos, simLegajoId]);
  const simLegajosForConvenio = useMemo(() => (receiptConvenioFilter ?? "").trim() === filterAllOption ? legajos : legajos.filter((l) => (l.convenio ?? "").trim() === (activeReceipt?.convenio ?? "").trim()), [legajos, receiptConvenioFilter, activeReceipt]);

  const definitiveOrderForScreen = Array.from(new Set(receiptsByScreenFilter.flatMap((receipt) => receipt.definitiveOrder)));
  const transitoryOrderForScreen = Array.from(new Set(receiptsByScreenFilter.flatMap((receipt) => receipt.transitoryOrder)));
  const definitivosEnReciboBase = definitiveOrderForScreen.map((id) => concepts.find((c) => c.id === id)).filter((c): c is ConceptModel => Boolean(c));
  const transitoriosEnReciboBase = transitoryOrderForScreen.map((id) => concepts.find((c) => c.id === id)).filter((c): c is ConceptModel => Boolean(c)).sort((a, b) => a.code.localeCompare(b.code, "es", { sensitivity: "base" }));
  const definitivosEnRecibo = receiptF1359Filter ? definitivosEnReciboBase.filter((concept) => (concept.f1359FieldId ?? "") === receiptF1359Filter) : definitivosEnReciboBase;
  const transitoriosEnRecibo = receiptF1359Filter ? transitoriosEnReciboBase.filter((concept) => (concept.f1359FieldId ?? "") === receiptF1359Filter) : transitoriosEnReciboBase;
  const normalizedReceiptTagFilter = receiptTagFilter.trim().toLowerCase();
  const definitivosEnReciboFiltrados = normalizedReceiptTagFilter ? definitivosEnRecibo.filter((concept) => (concept.tags ?? []).some((tag) => tag.trim().toLowerCase() === normalizedReceiptTagFilter)) : definitivosEnRecibo;
  const transitoriosEnReciboFiltrados = normalizedReceiptTagFilter ? transitoriosEnRecibo.filter((concept) => (concept.tags ?? []).some((tag) => tag.trim().toLowerCase() === normalizedReceiptTagFilter)) : transitoriosEnRecibo;

  const selectedConcept = concepts.find((c) => c.id === editingId) ?? concepts[0];
  const selectedFormulaAst = selectedConcept.formulaAst ?? [];
  const selectedFormulaTokens = useMemo(() => astToTokens(selectedConcept.formulaAst ?? []), [selectedConcept]);
  const conceptReceiptMembership = useMemo(() => receipts.map((receipt) => ({
    receiptId: receipt.id,
    convenio: receipt.convenio,
    liquidationType: receipt.liquidationType,
    belongs: selectedConcept.conceptClass === "definitivo" ? receipt.definitiveOrder.includes(selectedConcept.id) : receipt.transitoryOrder.includes(selectedConcept.id)
  })), [receipts, selectedConcept]);
  const membershipConvenioOptions = useMemo(() => Array.from(new Set(conceptReceiptMembership.map((item) => item.convenio))), [conceptReceiptMembership]);
  const membershipLiquidationTypeOptions = useMemo(() => Array.from(new Set(conceptReceiptMembership.map((item) => item.liquidationType))), [conceptReceiptMembership]);
  const selectedConveniosForIntersection = useMemo(() => membershipConvenioOptions.filter((convenio) => conceptReceiptMembership.some((item) => item.convenio === convenio && item.belongs)), [membershipConvenioOptions, conceptReceiptMembership]);
  const selectedLiquidationTypesForIntersection = useMemo(() => membershipLiquidationTypeOptions.filter((liquidationType) => conceptReceiptMembership.some((item) => item.liquidationType === liquidationType && item.belongs)), [membershipLiquidationTypeOptions, conceptReceiptMembership]);

  const participatingConcepts = useMemo(() => {
    const inReceipt = new Set([...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder]);
    const result = concepts.filter((c) => inReceipt.has(c.id));
    if (!result.some((c) => c.id === selectedConcept.id)) result.push(selectedConcept);
    return result;
  }, [concepts, activeReceipt, selectedConcept]);
  const receiptOrderIds = useMemo(() => [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder], [activeReceipt.definitiveOrder, activeReceipt.transitoryOrder]);
  const getValorLegajoResolved = (concepto: string, fallbackConcepto: string): number => getValorLegajo(simLegajo, composiciones, concepto, fallbackConcepto);
  const resolveMesAnteriorForSimulation = (rawArgs: string): number => resolveMesAnteriorValue(rawArgs, conceptCodeById, simLegajo, simMonth, simYear, liquidacionesHistory);
  const resolveSumaAnualForSimulation = (rawArgs: string): number => resolveSumaAnualValue(rawArgs, conceptCodeById, simLegajo, simMonth, simYear, liquidacionesHistory);
  const getAntiguedadYears = (): number => resolveAntiguedadYears(simLegajo, simMonth, simYear);
  const getAnterioresByType = (conceptId: number, conceptType: ConceptTypeId, values: Map<number, unknown>): number => {
    const receiptOrder = [...activeReceipt.definitiveOrder, ...activeReceipt.transitoryOrder];
    const currentIndex = receiptOrder.indexOf(conceptId);
    if (currentIndex === -1) return 0;
    let sum = 0;
    for (let i = 0; i < currentIndex; i += 1) {
      const prevId = receiptOrder[i];
      const prevConcept = participatingConcepts.find((c) => c.id === prevId);
      if (!prevConcept || prevConcept.conceptType !== conceptType) continue;
      sum += toNumericOrZero(values.get(prevId));
    }
    return sum;
  };
  const resolveValorLegajoConceptCodeResolved = (rawArg: string, fallbackConcepto: string): string => resolveValorLegajoConceptCode(rawArg, fallbackConcepto, conceptCodeById);
  const evaluation = useMemo(() => evaluateConcepts({
    concepts: participatingConcepts,
    allConcepts: concepts,
    conceptCodeById,
    legajo: simLegajo ? { id: simLegajo.id, fechaIngreso: simLegajo.fechaIngreso, valoresFijos: simLegajo.valoresFijos, composicionValoresFijos: resolveComposicionLegajo(simLegajo, composiciones)?.valoresFijos ?? [] } : null,
    receiptOrderIds,
    currentLiquidationType: activeReceipt?.liquidationType ?? "Normal",
    selectedConceptId: selectedConcept.id,
    asOfMonth: simMonth,
    asOfYear: simYear,
    liquidacionesHistory,
    gananciasTables
  }), [participatingConcepts, concepts, conceptCodeById, simLegajo, receiptOrderIds, activeReceipt?.liquidationType, selectedConcept.id, simMonth, simYear, liquidacionesHistory, gananciasTables, composiciones]);
  const previewInfo = useMemo(() => ({ value: evaluation.selectedValue, error: evaluation.selectedError }), [evaluation.selectedValue, evaluation.selectedError]);
  const { resolveTokenConceptId, getFormulaPillTitle } = useFormulaPillPreview({
    hidePrecalculationPreview,
    concepts,
    participatingConcepts,
    cycleConceptIds: evaluation.cycleIds,
    formulaErrorById: evaluation.errors,
    previewValueById: evaluation.values,
    selectedConceptId: selectedConcept.id,
    selectedConceptType: selectedConcept.conceptType ?? "remunerativo",
    getAnterioresByType,
    getValorLegajo: getValorLegajoResolved,
    resolveValorLegajoConceptCode: resolveValorLegajoConceptCodeResolved,
    resolveMesAnteriorForSimulation,
    resolveSumaAnualForSimulation,
    getAntiguedadYears
  });

  const { dragSourceRef: formulaDragSourceRef, setRootDragSource, setNestedDragSource } = useFormulaDragSource();
  const selectConceptFromFormulaToken = (tk: FormulaToken) => {
    const targetId = resolveTokenConceptId(tk);
    if (!targetId) return;
    setEditingId(targetId);
  };
  const { rootInsertSignal, triggerRootInsert, insertTokenAt, insertFromRawTextAt, insertBlockTemplateAt, setFormulaExpressionText, onTokenDropToFormula, renderRootFormulaToken, formulaExpressionText } =
    useFormulaEditor({
      selectedConcept,
      selectedFormulaTokens,
      selectedFormulaAst,
      conceptCodeById,
      concepts,
      setConcepts,
      setTagModal: setTagModal as Dispatch<SetStateAction<{ open: boolean; tag: string; insertAt: number }>>,
      formulaDragSourceRef,
      setRootDragSource,
      setNestedDragSource,
      setCursorGhost,
      getFormulaPillTitle,
      onSelectConceptFromToken: selectConceptFromFormulaToken,
      onShowGananciasInfo
    });

  const actions = useReceiptEditorActions({
    concepts, receipts, selectedConcept, activeReceiptId, setConcepts, setReceipts, setEditingId,
    selectedConveniosForIntersection, selectedLiquidationTypesForIntersection, allTags, setNewTagDraft, setConceptCodeDraft,
    setConceptNameDraft, setConceptTypeDraft, appearanceOpen, setAppearanceOpen, appearanceRef, membershipTypeDropdownOpen,
    membershipConvenioDropdownOpen, setMembershipTypeDropdownOpen, setMembershipConvenioDropdownOpen, membershipTypeComboRef,
    membershipConvenioComboRef, simLegajosForConvenio, simLegajoId, setSimLegajoId, receiptsByScreenFilter, setActiveReceiptId,
    tagModal, setTagModal, insertTokenAt
  });

  const formatPreviewAmount = (value: unknown): string => typeof value === "number" ? `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(value);

  return {
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
    dagOrderById: evaluation.dagOrderById,
    formulaErrorById: evaluation.errors,
    cycleConceptIds: evaluation.cycleIds,
    previewValueById: evaluation.values,
    formatPreviewAmount,
    gananciasTrace: evaluation.gananciasTrace,
    actions
  };
}
