import { RefObject } from "react";
import { AppMenu } from "./useTopbarMenu";

interface AppTopbarProps {
  menu: AppMenu;
  setMenu: (menu: AppMenu) => void;
  liquidacionesMenuOpen: boolean;
  setLiquidacionesMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  informacionMenuOpen: boolean;
  setInformacionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  liquidacionesMenuRef: RefObject<HTMLDivElement | null>;
  informacionMenuRef: RefObject<HTMLDivElement | null>;
  setMenuFromLiquidaciones: (menu: "conceptos" | "composiciones" | "novedades" | "liquidaciones") => void;
  setMenuFromInformacion: (menu: "informacion-f1359") => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function AppTopbar({
  menu,
  setMenu,
  liquidacionesMenuOpen,
  setLiquidacionesMenuOpen,
  informacionMenuOpen,
  setInformacionMenuOpen,
  liquidacionesMenuRef,
  informacionMenuRef,
  setMenuFromLiquidaciones,
  setMenuFromInformacion,
  undo,
  redo,
  canUndo,
  canRedo
}: AppTopbarProps) {
  return (
    <header className="topbar">
      <h1>Playadito Payroll</h1>
      <div className="history-controls">
        <button
          type="button"
          className="history-button"
          onClick={undo}
          disabled={!canUndo}
          title="Deshacer (Ctrl+Z)"
        >
          ←
        </button>
        <button
          type="button"
          className="history-button"
          onClick={redo}
          disabled={!canRedo}
          title="Rehacer (Ctrl+Shift+Z)"
        >
          →
        </button>
      </div>
      <nav className="topbar-nav" aria-label="Navegacion principal">
        <button className={menu === "dashboard" ? "menu active" : "menu"} onClick={() => setMenu("dashboard")}>
          Dashboard
        </button>
        <button className={menu === "legajos" ? "menu active" : "menu"} onClick={() => setMenu("legajos")}>
          Legajos
        </button>
        <div className="topbar-dropdown" ref={liquidacionesMenuRef}>
          <button
            className={
              menu === "conceptos" || menu === "composiciones" || menu === "novedades" || menu === "liquidaciones"
                ? "menu active"
                : "menu"
            }
            onClick={() => setLiquidacionesMenuOpen((prev) => !prev)}
          >
            Liquidaciones
          </button>
          {liquidacionesMenuOpen ? (
            <div className="topbar-dropdown-menu">
              <button
                className={menu === "conceptos" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                onClick={() => setMenuFromLiquidaciones("conceptos")}
              >
                Conceptos
              </button>
              <button
                className={menu === "composiciones" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                onClick={() => setMenuFromLiquidaciones("composiciones")}
              >
                Composiciones Salariales
              </button>
              <button
                className={menu === "novedades" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                onClick={() => setMenuFromLiquidaciones("novedades")}
              >
                Novedades
              </button>
              <button
                className={menu === "liquidaciones" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                onClick={() => setMenuFromLiquidaciones("liquidaciones")}
              >
                Liquidacion
              </button>
            </div>
          ) : null}
        </div>
        <div className="topbar-dropdown" ref={informacionMenuRef}>
          <button
            className={menu === "informacion-f1359" ? "menu active" : "menu"}
            onClick={() => setInformacionMenuOpen((prev) => !prev)}
          >
            Informacion
          </button>
          {informacionMenuOpen ? (
            <div className="topbar-dropdown-menu">
              <button
                className={menu === "informacion-f1359" ? "topbar-dropdown-item active" : "topbar-dropdown-item"}
                onClick={() => setMenuFromInformacion("informacion-f1359")}
              >
                F1359
              </button>
            </div>
          ) : null}
        </div>
        <button className={menu === "afip" ? "menu active" : "menu"} onClick={() => setMenu("afip")}>
          Contable
        </button>
      </nav>
    </header>
  );
}
