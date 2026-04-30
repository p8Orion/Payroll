import { Dispatch, RefObject, SetStateAction, useEffect } from "react";
import { colorPalette30, shapeCycle } from "../../model/constants";
import { token } from "../../model/helpers";
import { buildConstExpression } from "../../model/formula-ui";
import { ConceptModel, ConceptTypeId, ReceiptModel, TagAggregationOp } from "../../model/types";
import { apiBaseUrl, implicitTagForType, implicitTypeTagValues, normalizeTagsWithImplicitType } from "./receiptEditorUtils";

interface TagModalState {
  open: boolean;
  tag: string;
  insertAt: number;
}

interface UseReceiptEditorActionsParams {
  concepts: ConceptModel[];
  receipts: ReceiptModel[];
  selectedConcept: ConceptModel;
  activeReceiptId: string;
  setConcepts: Dispatch<SetStateAction<ConceptModel[]>>;
  setReceipts: Dispatch<SetStateAction<ReceiptModel[]>>;
  setEditingId: Dispatch<SetStateAction<number>>;
  selectedConveniosForIntersection: string[];
  selectedLiquidationTypesForIntersection: string[];
  allTags: string[];
  setNewTagDraft: Dispatch<SetStateAction<string>>;
  setConceptCodeDraft: Dispatch<SetStateAction<string>>;
  setConceptNameDraft: Dispatch<SetStateAction<string>>;
  setConceptTypeDraft: Dispatch<SetStateAction<ConceptTypeId>>;
  appearanceOpen: boolean;
  setAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  appearanceRef: RefObject<HTMLDivElement | null>;
  membershipTypeDropdownOpen: boolean;
  membershipConvenioDropdownOpen: boolean;
  setMembershipTypeDropdownOpen: Dispatch<SetStateAction<boolean>>;
  setMembershipConvenioDropdownOpen: Dispatch<SetStateAction<boolean>>;
  membershipTypeComboRef: RefObject<HTMLDivElement | null>;
  membershipConvenioComboRef: RefObject<HTMLDivElement | null>;
  simLegajosForConvenio: Array<{ id: string }>;
  simLegajoId: string;
  setSimLegajoId: Dispatch<SetStateAction<string>>;
  receiptsByScreenFilter: ReceiptModel[];
  setActiveReceiptId: Dispatch<SetStateAction<string>>;
  tagModal: TagModalState;
  setTagModal: Dispatch<SetStateAction<TagModalState>>;
  insertTokenAt: (newToken: import("../../model/types").FormulaToken, index: number) => void;
}

export function useReceiptEditorActions({
  concepts,
  receipts,
  selectedConcept,
  activeReceiptId,
  setConcepts,
  setReceipts,
  setEditingId,
  selectedConveniosForIntersection,
  selectedLiquidationTypesForIntersection,
  allTags,
  setNewTagDraft,
  setConceptCodeDraft,
  setConceptNameDraft,
  setConceptTypeDraft,
  appearanceOpen,
  setAppearanceOpen,
  appearanceRef,
  membershipTypeDropdownOpen,
  membershipConvenioDropdownOpen,
  setMembershipTypeDropdownOpen,
  setMembershipConvenioDropdownOpen,
  membershipTypeComboRef,
  membershipConvenioComboRef,
  simLegajosForConvenio,
  simLegajoId,
  setSimLegajoId,
  receiptsByScreenFilter,
  setActiveReceiptId,
  tagModal,
  setTagModal,
  insertTokenAt
}: UseReceiptEditorActionsParams) {
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

  const addTransitory = () => {
    const newId = Math.max(...concepts.map((c) => c.id)) + 1;
    const newConcept: ConceptModel = {
      id: newId,
      code: `TRANS_${newId}`,
      name: `Transitorio ${newId}`,
      conceptClass: "transitorio",
      conceptType: "remunerativo",
      color: colorPalette30[(newId - 1) % colorPalette30.length],
      shape: shapeCycle[(newId - 1) % shapeCycle.length],
      tags: [implicitTagForType("remunerativo")],
      formulaAst: []
    };
    setConcepts((prev) => [...prev, newConcept]);
    setReceipts((prev) =>
      prev.map((receipt) =>
        receipt.id === activeReceiptId
          ? { ...receipt, transitoryOrder: [...receipt.transitoryOrder, newId] }
          : receipt
      )
    );
    setEditingId(newId);
  };

  const addDefinitiveToReceipt = () => {
    const newId = Math.max(...concepts.map((c) => c.id)) + 1;
    const newConcept: ConceptModel = {
      id: newId,
      code: `DEF_${newId}`,
      name: `Concepto definitivo ${newId}`,
      conceptClass: "definitivo",
      conceptType: "remunerativo",
      color: colorPalette30[(newId - 1) % colorPalette30.length],
      shape: shapeCycle[(newId - 1) % shapeCycle.length],
      tags: [implicitTagForType("remunerativo")],
      formulaAst: []
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

  const setSelectedConceptReceiptMembership = (receiptId: string, shouldBelong: boolean) => {
    const conceptId = selectedConcept.id;
    const isDefinitive = selectedConcept.conceptClass === "definitivo";
    setReceipts((prev) =>
      prev.map((receipt) => {
        if (receipt.id !== receiptId) return receipt;
        if (isDefinitive) {
          const exists = receipt.definitiveOrder.includes(conceptId);
          if (shouldBelong && !exists) {
            return { ...receipt, definitiveOrder: [...receipt.definitiveOrder, conceptId] };
          }
          if (!shouldBelong && exists) {
            return { ...receipt, definitiveOrder: receipt.definitiveOrder.filter((id) => id !== conceptId) };
          }
          return receipt;
        }
        const exists = receipt.transitoryOrder.includes(conceptId);
        if (shouldBelong && !exists) {
          return { ...receipt, transitoryOrder: [...receipt.transitoryOrder, conceptId] };
        }
        if (!shouldBelong && exists) {
          return { ...receipt, transitoryOrder: receipt.transitoryOrder.filter((id) => id !== conceptId) };
        }
        return receipt;
      })
    );
  };

  const setSelectedConceptMembershipByLiquidationType = (
    liquidationType: string,
    shouldBelong: boolean
  ) => {
    const conceptId = selectedConcept.id;
    const isDefinitive = selectedConcept.conceptClass === "definitivo";
    const conveniosScope = selectedConveniosForIntersection.length
      ? new Set(selectedConveniosForIntersection)
      : null;
    setReceipts((prev) =>
      prev.map((receipt) => {
        if (receipt.liquidationType !== liquidationType) return receipt;
        if (conveniosScope && !conveniosScope.has(receipt.convenio)) return receipt;
        if (isDefinitive) {
          const exists = receipt.definitiveOrder.includes(conceptId);
          if (shouldBelong && !exists) {
            return { ...receipt, definitiveOrder: [...receipt.definitiveOrder, conceptId] };
          }
          if (!shouldBelong && exists) {
            return { ...receipt, definitiveOrder: receipt.definitiveOrder.filter((id) => id !== conceptId) };
          }
          return receipt;
        }
        const exists = receipt.transitoryOrder.includes(conceptId);
        if (shouldBelong && !exists) {
          return { ...receipt, transitoryOrder: [...receipt.transitoryOrder, conceptId] };
        }
        if (!shouldBelong && exists) {
          return { ...receipt, transitoryOrder: receipt.transitoryOrder.filter((id) => id !== conceptId) };
        }
        return receipt;
      })
    );
  };

  const setSelectedConceptMembershipByConvenio = (convenio: string, shouldBelong: boolean) => {
    const conceptId = selectedConcept.id;
    const isDefinitive = selectedConcept.conceptClass === "definitivo";
    const liquidationTypesScope = selectedLiquidationTypesForIntersection.length
      ? new Set(selectedLiquidationTypesForIntersection)
      : null;
    setReceipts((prev) =>
      prev.map((receipt) => {
        if (receipt.convenio !== convenio) return receipt;
        if (liquidationTypesScope && !liquidationTypesScope.has(receipt.liquidationType)) return receipt;
        if (isDefinitive) {
          const exists = receipt.definitiveOrder.includes(conceptId);
          if (shouldBelong && !exists) {
            return { ...receipt, definitiveOrder: [...receipt.definitiveOrder, conceptId] };
          }
          if (!shouldBelong && exists) {
            return { ...receipt, definitiveOrder: receipt.definitiveOrder.filter((id) => id !== conceptId) };
          }
          return receipt;
        }
        const exists = receipt.transitoryOrder.includes(conceptId);
        if (shouldBelong && !exists) {
          return { ...receipt, transitoryOrder: [...receipt.transitoryOrder, conceptId] };
        }
        if (!shouldBelong && exists) {
          return { ...receipt, transitoryOrder: receipt.transitoryOrder.filter((id) => id !== conceptId) };
        }
        return receipt;
      })
    );
  };

  const addTagToSelectedConcept = (tagInput: string) => {
    const normalized = tagInput.trim().toLowerCase();
    if (!normalized) return;
    setConcepts((prev) =>
      prev.map((c) => {
        if (c.id !== selectedConcept.id) return c;
        if (implicitTypeTagValues.has(normalized)) {
          return { ...c, tags: normalizeTagsWithImplicitType(c.tags, c.conceptType) };
        }
        if (c.tags.includes(normalized)) return c;
        return { ...c, tags: normalizeTagsWithImplicitType([...c.tags, normalized], c.conceptType) };
      })
    );
    setNewTagDraft("");
  };

  const updateSelectedConceptCode = (nextValue: string) => {
    setConceptCodeDraft(nextValue);
    const nextCode = nextValue.trim();
    if (!nextCode) return;
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, code: nextCode.toUpperCase() }
          : c
      )
    );
  };

  const updateSelectedConceptName = (nextValue: string) => {
    setConceptNameDraft(nextValue);
    const nextName = nextValue.trim();
    if (!nextName) return;
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, name: nextName }
          : c
      )
    );
  };

  const updateSelectedConceptType = (nextType: ConceptTypeId) => {
    setConceptTypeDraft(nextType);
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, conceptType: nextType, tags: normalizeTagsWithImplicitType(c.tags, nextType) }
          : c
      )
    );
  };

  const updateSelectedConceptF1359Field = (f1359FieldId: string) => {
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, f1359FieldId: f1359FieldId.trim() }
          : c
      )
    );
  };

  const deleteSelectedConcept = () => {
    if (concepts.length <= 1) return;
    const removingId = selectedConcept.id;
    const ok = window.confirm(
      `¿Eliminar concepto ${selectedConcept.code} - ${selectedConcept.name}?`
    );
    if (!ok) return;
    void fetch(`${apiBaseUrl}/concepts/${removingId}`, { method: "DELETE" });
    const remaining = concepts.filter((c) => c.id !== removingId);
    setConcepts(remaining);
    setReceipts((prev) =>
      prev.map((receipt) => ({
        ...receipt,
        definitiveOrder: receipt.definitiveOrder.filter((id) => id !== removingId),
        transitoryOrder: receipt.transitoryOrder.filter((id) => id !== removingId)
      }))
    );
    const nextSelected = remaining[0];
    if (nextSelected) {
      setEditingId(nextSelected.id);
    }
  };

  const updateSelectedAppearance = (patch: Partial<Pick<ConceptModel, "shape" | "color">>) => {
    setConcepts((prev) =>
      prev.map((c) => (c.id === selectedConcept.id ? { ...c, ...patch } : c))
    );
  };

  const removeTagFromSelectedConcept = (tagToRemove: string) => {
    if (tagToRemove === implicitTagForType(selectedConcept.conceptType)) return;
    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? {
              ...c,
              tags: normalizeTagsWithImplicitType(
                c.tags.filter((tag) => tag !== tagToRemove),
                c.conceptType
              )
            }
          : c
      )
    );
  };

  const handleTagDraftChange = (nextValue: string) => {
    setNewTagDraft(nextValue);
    const normalized = nextValue.trim().toLowerCase();
    if (!normalized) return;
    if (!allTags.includes(normalized)) return;
    addTagToSelectedConcept(nextValue);
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

  useEffect(() => {
    setConcepts((prev) => {
      const next = prev.map((concept) => {
        const normalizedTags = normalizeTagsWithImplicitType(concept.tags ?? [], concept.conceptType);
        const currentTags = concept.tags ?? [];
        const unchanged =
          normalizedTags.length === currentTags.length &&
          normalizedTags.every((tag, i) => tag === currentTags[i]);
        return unchanged ? concept : { ...concept, tags: normalizedTags };
      });
      const changed = next.some((concept, i) => concept !== prev[i]);
      return changed ? next : prev;
    });
  }, [setConcepts]);

  useEffect(() => {
    setConceptCodeDraft(selectedConcept.code);
    setConceptNameDraft(selectedConcept.name);
    setConceptTypeDraft(selectedConcept.conceptType ?? "remunerativo");
  }, [selectedConcept.id, selectedConcept.code, selectedConcept.name, selectedConcept.conceptType, setConceptCodeDraft, setConceptNameDraft, setConceptTypeDraft]);

  useEffect(() => {
    if (!appearanceOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!appearanceRef.current) return;
      if (appearanceRef.current.contains(event.target as Node)) return;
      setAppearanceOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [appearanceOpen, appearanceRef, setAppearanceOpen]);

  useEffect(() => {
    if (!membershipTypeDropdownOpen && !membershipConvenioDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (membershipTypeComboRef.current?.contains(target)) return;
      if (membershipConvenioComboRef.current?.contains(target)) return;
      setMembershipTypeDropdownOpen(false);
      setMembershipConvenioDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [
    membershipTypeDropdownOpen,
    membershipConvenioDropdownOpen,
    membershipTypeComboRef,
    membershipConvenioComboRef,
    setMembershipTypeDropdownOpen,
    setMembershipConvenioDropdownOpen
  ]);

  useEffect(() => {
    if (!simLegajosForConvenio.length) {
      setSimLegajoId("");
      return;
    }
    if (!simLegajoId || !simLegajosForConvenio.some((l) => l.id === simLegajoId)) {
      setSimLegajoId(simLegajosForConvenio[0].id);
    }
  }, [simLegajosForConvenio, simLegajoId, setSimLegajoId]);

  useEffect(() => {
    if (!receipts.length) return;
    const active = receiptsByScreenFilter.find((r) => r.id === activeReceiptId);
    if (active) return;
    if (receiptsByScreenFilter.length) {
      setActiveReceiptId(receiptsByScreenFilter[0].id);
      return;
    }
    setActiveReceiptId(receipts[0]?.id ?? "");
  }, [receipts, receiptsByScreenFilter, activeReceiptId, setActiveReceiptId]);

  return {
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
  };
}
