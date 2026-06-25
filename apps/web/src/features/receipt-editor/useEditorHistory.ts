import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { ConceptModel, ReceiptModel } from "../../model/types";
import { EditorSnapshot, maxHistoryEntries } from "./receiptEditorUtils";
import type { AppMenu } from "../topbar/useTopbarMenu";

interface UseEditorHistoryParams {
  concepts: ConceptModel[];
  receipts: ReceiptModel[];
  menu: AppMenu;
  activeReceiptId: string;
  editingId: number;
  conceptsLoaded: boolean;
  setConcepts: Dispatch<SetStateAction<ConceptModel[]>>;
  setReceipts: Dispatch<SetStateAction<ReceiptModel[]>>;
  setMenu: Dispatch<SetStateAction<AppMenu>>;
  setActiveReceiptId: Dispatch<SetStateAction<string>>;
  setEditingId: Dispatch<SetStateAction<number>>;
}

export function useEditorHistory({
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
}: UseEditorHistoryParams) {
  const [historyPast, setHistoryPast] = useState<EditorSnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<EditorSnapshot[]>([]);
  const historyLastRef = useRef<string>("");
  const historyApplyingRef = useRef(false);

  const createSnapshot = useCallback(
    (): EditorSnapshot => ({
      concepts: JSON.parse(JSON.stringify(concepts)) as ConceptModel[],
      receipts: JSON.parse(JSON.stringify(receipts)) as ReceiptModel[],
      menu,
      activeReceiptId,
      editingId
    }),
    [concepts, receipts, menu, activeReceiptId, editingId]
  );

  const applySnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      historyApplyingRef.current = true;
      setConcepts(snapshot.concepts);
      setReceipts(snapshot.receipts);
      setMenu(snapshot.menu);
      setActiveReceiptId(snapshot.activeReceiptId);
      setEditingId(snapshot.editingId);
    },
    [setConcepts, setReceipts, setMenu, setActiveReceiptId, setEditingId]
  );

  const undo = useCallback(() => {
    setHistoryPast((prevPast) => {
      if (!prevPast.length) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const current = createSnapshot();
      setHistoryFuture((prevFuture) => [current, ...prevFuture].slice(0, maxHistoryEntries));
      applySnapshot(previous);
      return prevPast.slice(0, -1);
    });
  }, [applySnapshot, createSnapshot]);

  const redo = useCallback(() => {
    setHistoryFuture((prevFuture) => {
      if (!prevFuture.length) return prevFuture;
      const next = prevFuture[0];
      const current = createSnapshot();
      setHistoryPast((prevPast) => [...prevPast, current].slice(-maxHistoryEntries));
      applySnapshot(next);
      return prevFuture.slice(1);
    });
  }, [applySnapshot, createSnapshot]);

  useEffect(() => {
    if (!conceptsLoaded) return;
    const serialized = JSON.stringify({ concepts, receipts, menu, activeReceiptId, editingId });
    if (!historyLastRef.current) {
      historyLastRef.current = serialized;
      return;
    }
    if (serialized === historyLastRef.current) return;

    if (historyApplyingRef.current) {
      historyApplyingRef.current = false;
      historyLastRef.current = serialized;
      return;
    }

    const previous = JSON.parse(historyLastRef.current) as EditorSnapshot;
    setHistoryPast((prev) => [...prev, previous].slice(-maxHistoryEntries));
    setHistoryFuture([]);
    historyLastRef.current = serialized;
  }, [concepts, receipts, menu, activeReceiptId, editingId, conceptsLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        ((key === "z" && event.shiftKey) || key === "y")
      ) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return {
    undo,
    redo,
    canUndo: historyPast.length > 0,
    canRedo: historyFuture.length > 0
  };
}
