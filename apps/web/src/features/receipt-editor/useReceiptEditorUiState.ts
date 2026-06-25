import { Dispatch, RefObject, SetStateAction, useRef, useState } from "react";
import {
  genericDefaultConvenio,
  receiptF1359FilterStorageKey,
  receiptTagFilterStorageKey
} from "./receiptEditorUtils";
import { ConceptTypeId } from "../../model/types";

interface TagModalState {
  open: boolean;
  tag: string;
  insertAt: number;
}

export interface UseReceiptEditorUiStateResult {
  activeReceiptId: string;
  setActiveReceiptId: Dispatch<SetStateAction<string>>;
  receiptConvenioFilter: string;
  setReceiptConvenioFilter: Dispatch<SetStateAction<string>>;
  receiptLiquidationTypeFilter: string;
  setReceiptLiquidationTypeFilter: Dispatch<SetStateAction<string>>;
  simLegajoId: string;
  setSimLegajoId: Dispatch<SetStateAction<string>>;
  simMonth: number;
  setSimMonth: Dispatch<SetStateAction<number>>;
  simYear: number;
  setSimYear: Dispatch<SetStateAction<number>>;
  newTagDraft: string;
  setNewTagDraft: Dispatch<SetStateAction<string>>;
  appearanceOpen: boolean;
  setAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  conceptCodeDraft: string;
  setConceptCodeDraft: Dispatch<SetStateAction<string>>;
  conceptNameDraft: string;
  setConceptNameDraft: Dispatch<SetStateAction<string>>;
  conceptTypeDraft: ConceptTypeId | "";
  setConceptTypeDraft: Dispatch<SetStateAction<ConceptTypeId | "">>;
  membershipTypeDropdownOpen: boolean;
  setMembershipTypeDropdownOpen: Dispatch<SetStateAction<boolean>>;
  membershipConvenioDropdownOpen: boolean;
  setMembershipConvenioDropdownOpen: Dispatch<SetStateAction<boolean>>;
  showReceiptConceptDetail: boolean;
  setShowReceiptConceptDetail: Dispatch<SetStateAction<boolean>>;
  receiptF1359Filter: string;
  setReceiptF1359Filter: Dispatch<SetStateAction<string>>;
  receiptTagFilter: string;
  setReceiptTagFilter: Dispatch<SetStateAction<string>>;
  appearanceRef: RefObject<HTMLDivElement | null>;
  membershipTypeComboRef: RefObject<HTMLDivElement | null>;
  membershipConvenioComboRef: RefObject<HTMLDivElement | null>;
  tagModal: TagModalState;
  setTagModal: Dispatch<SetStateAction<TagModalState>>;
}

export function useReceiptEditorUiState(): UseReceiptEditorUiStateResult {
  const [activeReceiptId, setActiveReceiptId] = useState("");
  const [receiptConvenioFilter, setReceiptConvenioFilter] = useState(genericDefaultConvenio);
  const [receiptLiquidationTypeFilter, setReceiptLiquidationTypeFilter] = useState<string>("Normal");
  const [simLegajoId, setSimLegajoId] = useState<string>("");
  const [simMonth, setSimMonth] = useState<number>(new Date().getMonth() + 1);
  const [simYear, setSimYear] = useState<number>(new Date().getFullYear());
  const [newTagDraft, setNewTagDraft] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [conceptCodeDraft, setConceptCodeDraft] = useState("");
  const [conceptNameDraft, setConceptNameDraft] = useState("");
  const [conceptTypeDraft, setConceptTypeDraft] = useState<ConceptTypeId | "">("remunerativo");
  const [membershipTypeDropdownOpen, setMembershipTypeDropdownOpen] = useState(false);
  const [membershipConvenioDropdownOpen, setMembershipConvenioDropdownOpen] = useState(false);
  const [showReceiptConceptDetail, setShowReceiptConceptDetail] = useState(false);
  const [receiptF1359Filter, setReceiptF1359Filter] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(receiptF1359FilterStorageKey) ?? "";
  });
  const [receiptTagFilter, setReceiptTagFilter] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(receiptTagFilterStorageKey) ?? "";
  });
  const appearanceRef = useRef<HTMLDivElement | null>(null);
  const membershipTypeComboRef = useRef<HTMLDivElement | null>(null);
  const membershipConvenioComboRef = useRef<HTMLDivElement | null>(null);
  const [tagModal, setTagModal] = useState<TagModalState>({ open: false, tag: "", insertAt: 0 });

  return {
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
  };
}
