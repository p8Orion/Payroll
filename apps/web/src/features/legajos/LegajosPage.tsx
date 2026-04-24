import { useEffect, useMemo, useState } from "react";

export interface LegajoValorFijo {
  id: string;
  concepto: string;
  valor: number;
}

export interface LegajoModel {
  id: string;
  nroLegajo: string;
  nombre: string;
  convenio: string;
  composicionSalarial: string;
  valoresFijos: LegajoValorFijo[];
}

interface LegajosPageProps {
  legajos: LegajoModel[];
  conceptOptions: string[];
  onChangeLegajos: (next: LegajoModel[]) => void;
}

const nextLegajoId = (() => {
  let id = 0;
  return () => `legajo_${++id}`;
})();

const nextValorId = (() => {
  let id = 0;
  return () => `vf_${++id}`;
})();

function createLegajo(): LegajoModel {
  return {
    id: nextLegajoId(),
    nroLegajo: "",
    nombre: "",
    convenio: "",
    composicionSalarial: "",
    valoresFijos: []
  };
}

export function LegajosPage({ legajos, conceptOptions, onChangeLegajos }: LegajosPageProps) {
  const normalizedLegajos = useMemo(() => {
    const used = new Set<string>();
    return legajos.map((l, index) => {
      let nextId = (l.id ?? "").trim();
      if (!nextId || used.has(nextId)) {
        nextId = `legajo_${index + 1}_${Math.random().toString(36).slice(2, 8)}`;
      }
      used.add(nextId);
      return nextId === l.id ? l : { ...l, id: nextId };
    });
  }, [legajos]);
  const needsIdMigration = useMemo(
    () =>
      normalizedLegajos.length !== legajos.length ||
      normalizedLegajos.some((l, i) => l.id !== legajos[i]?.id),
    [normalizedLegajos, legajos]
  );

  const [selectedId, setSelectedId] = useState<string>(normalizedLegajos[0]?.id ?? "");
  const selected = useMemo(
    () => normalizedLegajos.find((l) => l.id === selectedId) ?? normalizedLegajos[0] ?? null,
    [normalizedLegajos, selectedId]
  );

  useEffect(() => {
    if (needsIdMigration) {
      onChangeLegajos(normalizedLegajos);
    }
  }, [needsIdMigration, normalizedLegajos, onChangeLegajos]);

  useEffect(() => {
    if (!normalizedLegajos.length) {
      if (selectedId !== "") setSelectedId("");
      return;
    }
    if (!selectedId || !normalizedLegajos.some((l) => l.id === selectedId)) {
      setSelectedId(normalizedLegajos[0].id);
    }
  }, [normalizedLegajos, selectedId]);

  const updateSelected = (updater: (current: LegajoModel) => LegajoModel) => {
    if (!selected) return;
    onChangeLegajos(normalizedLegajos.map((l) => (l.id === selected.id ? updater(l) : l)));
  };

  const addLegajo = () => {
    const created = createLegajo();
    onChangeLegajos([...normalizedLegajos, created]);
    setSelectedId(created.id);
  };

  const removeSelected = () => {
    if (!selected) return;
    const next = normalizedLegajos.filter((l) => l.id !== selected.id);
    onChangeLegajos(next);
    setSelectedId(next[0]?.id ?? "");
  };

  return (
    <section className="legajos-grid">
      <article className="panel">
        <div className="legajos-header">
          <h2>Legajos</h2>
          <button className="add-button" onClick={addLegajo}>
            + Nuevo legajo
          </button>
        </div>
        <ul className="concept-list">
          {normalizedLegajos.map((l) => (
            <li
              key={l.id}
              className={l.id === selected?.id ? "concept-item selected" : "concept-item"}
              onClick={() => setSelectedId(l.id)}
            >
              <div>
                <strong>{l.nroLegajo || "S/N"}</strong> - {l.nombre || "Sin nombre"}
              </div>
            </li>
          ))}
        </ul>
      </article>

      <article className="panel">
        {!selected ? (
          <p>No hay legajos cargados.</p>
        ) : (
          <>
            <div className="legajos-header">
              <h2>ABM de Legajo</h2>
              <button className="remove-inline-button" onClick={removeSelected} title="Eliminar legajo">
                -
              </button>
            </div>
            <div className="receipt-toolbar">
              <div>
                <label>Nro Legajo</label>
                <input
                  value={selected.nroLegajo}
                  onChange={(e) =>
                    updateSelected((current) => ({ ...current, nroLegajo: e.target.value }))
                  }
                  placeholder="Ej: 000123"
                />
              </div>
              <div>
                <label>Nombre</label>
                <input
                  value={selected.nombre}
                  onChange={(e) =>
                    updateSelected((current) => ({ ...current, nombre: e.target.value }))
                  }
                  placeholder="Apellido, Nombre"
                />
              </div>
              <div>
                <label>Convenio</label>
                <input
                  value={selected.convenio}
                  onChange={(e) =>
                    updateSelected((current) => ({ ...current, convenio: e.target.value }))
                  }
                  placeholder="Ej: Luz y Fuerza"
                />
              </div>
            </div>
            <div className="receipt-toolbar">
              <div style={{ width: "100%" }}>
                <label>Composición Salarial</label>
                <input
                  value={selected.composicionSalarial}
                  onChange={(e) =>
                    updateSelected((current) => ({
                      ...current,
                      composicionSalarial: e.target.value
                    }))
                  }
                  placeholder="Ej: Administrativo A"
                />
              </div>
            </div>

            <div className="legajos-fixed-values">
              <div className="legajos-header">
                <h3>Valores Fijos</h3>
                <button
                  className="add-button"
                  onClick={() =>
                    updateSelected((current) => ({
                      ...current,
                      valoresFijos: [
                        ...current.valoresFijos,
                        { id: nextValorId(), concepto: "", valor: 0 }
                      ]
                    }))
                  }
                >
                  + Agregar valor fijo
                </button>
              </div>
              {selected.valoresFijos.length === 0 ? (
                <p className="concept-meta-inline">Sin valores fijos.</p>
              ) : (
                <div className="legajos-fixed-values-list">
                  {selected.valoresFijos.map((vf) => (
                    <div key={vf.id} className="legajos-fixed-row">
                      <input
                        list="legajos-concept-options"
                        value={vf.concepto}
                        onChange={(e) =>
                          updateSelected((current) => ({
                            ...current,
                            valoresFijos: current.valoresFijos.map((item) =>
                              item.id === vf.id ? { ...item, concepto: e.target.value } : item
                            )
                          }))
                        }
                        placeholder="Concepto"
                      />
                      <input
                        type="number"
                        value={vf.valor}
                        onChange={(e) =>
                          updateSelected((current) => ({
                            ...current,
                            valoresFijos: current.valoresFijos.map((item) =>
                              item.id === vf.id ? { ...item, valor: Number(e.target.value || 0) } : item
                            )
                          }))
                        }
                        placeholder="Valor"
                      />
                      <button
                        className="remove-inline-button"
                        onClick={() =>
                          updateSelected((current) => ({
                            ...current,
                            valoresFijos: current.valoresFijos.filter((item) => item.id !== vf.id)
                          }))
                        }
                        title="Eliminar valor fijo"
                      >
                        -
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <datalist id="legajos-concept-options">
                {conceptOptions.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
