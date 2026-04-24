import { useEffect, useRef } from "react";
import { FormulaToken } from "../model/types";
import { FormulaDragSource } from "../model/formula-dnd";

export function useFormulaDragSource() {
  const dragSourceRef = useRef<FormulaDragSource | null>(null);

  const setRootDragSource = (tokenId: string) => {
    dragSourceRef.current = { kind: "root", tokenId };
  };

  const setNestedDragSource = (
    pathKey: string,
    argIndex: number,
    tokenIndex: number,
    token: FormulaToken
  ) => {
    dragSourceRef.current = { kind: "nested", pathKey, argIndex, tokenIndex, token };
  };

  const clearDragSource = () => {
    dragSourceRef.current = null;
  };

  useEffect(() => {
    window.addEventListener("dragend", clearDragSource);
    window.addEventListener("drop", clearDragSource);
    return () => {
      window.removeEventListener("dragend", clearDragSource);
      window.removeEventListener("drop", clearDragSource);
    };
  }, []);

  return {
    dragSourceRef,
    setRootDragSource,
    setNestedDragSource
  };
}
