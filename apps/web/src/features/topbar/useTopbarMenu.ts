import { useEffect, useRef, useState } from "react";

export type AppMenu =
  | "dashboard"
  | "legajos"
  | "conceptos"
  | "composiciones"
  | "novedades"
  | "liquidaciones"
  | "informacion-f1359"
  | "afip";

export function useTopbarMenu() {
  const [menu, setMenu] = useState<AppMenu>("conceptos");
  const [liquidacionesMenuOpen, setLiquidacionesMenuOpen] = useState(false);
  const [informacionMenuOpen, setInformacionMenuOpen] = useState(false);
  const liquidacionesMenuRef = useRef<HTMLDivElement | null>(null);
  const informacionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!liquidacionesMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!liquidacionesMenuRef.current) return;
      if (liquidacionesMenuRef.current.contains(event.target as Node)) return;
      setLiquidacionesMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [liquidacionesMenuOpen]);

  useEffect(() => {
    if (!informacionMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!informacionMenuRef.current) return;
      if (informacionMenuRef.current.contains(event.target as Node)) return;
      setInformacionMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [informacionMenuOpen]);

  const setMenuFromLiquidaciones = (nextMenu: Extract<AppMenu, "conceptos" | "composiciones" | "novedades" | "liquidaciones">) => {
    setMenu(nextMenu);
    setLiquidacionesMenuOpen(false);
    setInformacionMenuOpen(false);
  };

  const setMenuFromInformacion = (nextMenu: Extract<AppMenu, "informacion-f1359">) => {
    setMenu(nextMenu);
    setInformacionMenuOpen(false);
    setLiquidacionesMenuOpen(false);
  };

  return {
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
  };
}
