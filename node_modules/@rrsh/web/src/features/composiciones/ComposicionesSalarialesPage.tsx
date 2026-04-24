import { useMemo, useState } from "react";

export interface ComposicionValorFijo {
  id: string;
  clave: string;
  valor: number;
}

export interface ComposicionSalarialModel {
  id: string;
  code: string;
  convenio: string;
  valoresFijos: ComposicionValorFijo[];
}

interface ComposicionesSalarialesPageProps {
  composiciones: ComposicionSalarialModel[];
  convenioOptions: string[];
  fixedValueKeys: string[];
  onEnsureFixedValueKey?: (key: string) => void;
  onChangeComposiciones: (next: ComposicionSalarialModel[]) => void;
}

function nextIdFromUsed(used: Set<string>, prefix: string): string {
  let maxNumeric = 0;
  for (const id of used) {
    const match = id.match(new RegExp(`^${prefix}_(\\d+)$`));
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      maxNumeric = Math.max(maxNumeric, parsed);
    }
  }
  let candidate = `${prefix}_${maxNumeric + 1}`;
  while (used.has(candidate)) {
    maxNumeric += 1;
    candidate = `${prefix}_${maxNumeric + 1}`;
  }
  return candidate;
}

function createComposicion(existing: ComposicionSalarialModel[]): ComposicionSalarialModel {
  const usedIds = new Set(existing.map((item) => item.id));
  return {
    id: nextIdFromUsed(usedIds, "comp"),
    code: "",
    convenio: "",
    valoresFijos: []
  };
}

export function ComposicionesSalarialesPage({
  composiciones,
  convenioOptions,
  fixedValueKeys,
  onChangeComposiciones
}: ComposicionesSalarialesPageProps) {
  const [selectedId, setSelectedId] = useState<string>(composiciones[0]?.id ?? "");
  const selected = useMemo(
    () => composiciones.find((c) => c.id === selectedId) ?? composiciones[0] ?? null,
    [composiciones, selectedId]
  );
  const usedFixedKeys = useMemo(
    () => new Set((selected?.valoresFijos ?? []).map((item) => item.clave.trim().toLowerCase()).filter(Boolean)),
    [selected]
  );

  const updateSelected = (updater: (current: ComposicionSalarialModel) => ComposicionSalarialModel) => {
    if (!selected) return;
    onChangeComposiciones(composiciones.map((c) => (c.id === selected.id ? updater(c) : c)));
  };

  const addComposicion = () => {
    const created = createComposicion(composiciones);
    onChangeComposiciones([...composiciones, created]);
    setSelectedId(created.id);
  };

  const removeSelected = () => {
    if (!selected) return;
    const next = composiciones.filter((c) => c.id !== selected.id);
    onChangeComposiciones(next);
    setSelectedId(next[0]?.id ?? "");
  };

  return (
    <section className="legajos-grid">
      <article className="panel">
        <div className="legajos-header">
          <h2>Composición Salarial</h2>
          <button className="add-button" onClick={addComposicion}>
            + Nueva composición
          </button>
        </div>
        <ul className="concept-list">
          {composiciones.map((item) => (
            <li
              key={item.id}
              className={item.id === selected?.id ? "concept-item selected" : "concept-item"}
              onClick={() => setSelectedId(item.id)}
            >
              <div>
                <strong>{item.code || "SIN_CODIGO"}</strong> - {item.convenio || "Sin convenio"}
              </div>
            </li>
          ))}
        </ul>
      </article>

      <article className="panel">
        {!selected ? (
          <p>No hay composiciones cargadas.</p>
        ) : (
          <>
            <div className="legajos-header">
              <h2>ABM de Composición</h2>
              <button className="remove-inline-button" onClick={removeSelected} title="Eliminar composición">
                -
              </button>
            </div>
            <div className="receipt-toolbar">
              <div>
                <label>Código</label>
                <input
                  value={selected.code}
                  onChange={(e) => updateSelected((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
                  placeholder="Ej: ADMIN_A"
                />
              </div>
              <div>
                <label>Convenio</label>
                <select
                  value={selected.convenio}
                  onChange={(e) => updateSelected((current) => ({ ...current, convenio: e.target.value }))}
                >
                  <option value="">Sin convenio</option>
                  {convenioOptions.map((convenio) => (
                    <option key={convenio} value={convenio}>
                      {convenio}
                    </option>
                  ))}
                </select>
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
                        {
                          id: nextIdFromUsed(new Set(current.valoresFijos.map((item) => item.id)), "cvf"),
                          clave: "",
                          valor: 0
                        }
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
                        className="fixed-value-key-input"
                        list={`fixed-value-keys-comp-${selected.id}`}
                        value={vf.clave}
                        onChange={(e) => {
                          const nextKey = e.target.value;
                          updateSelected((current) => ({
                            ...current,
                            valoresFijos: current.valoresFijos.map((item) =>
                              item.id === vf.id ? { ...item, clave: nextKey } : item
                            )
                          }));
                        }}
                        placeholder="Clave"
                      />
                      <input
                        className="fixed-value-number-input"
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
              <datalist id={`fixed-value-keys-comp-${selected.id}`}>
                {fixedValueKeys
                  .filter((key) => !usedFixedKeys.has(key.trim().toLowerCase()))
                  .map((key) => (
                    <option key={key} value={key} />
                  ))}
              </datalist>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
