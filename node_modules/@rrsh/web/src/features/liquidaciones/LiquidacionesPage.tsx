import { useEffect, useMemo, useState } from "react";
import { formulaToExpression } from "../../model/helpers";
import { astToTokens } from "../../model/formula-dnd";
import { evaluateConcepts } from "../../model/liquidation-eval";
import {
  CONCEPT_TYPE_DEFINITIONS,
  ConceptModel,
  ConceptTypeId,
  getConceptTypeDefinition,
  LIQUIDATION_TYPES,
  ReceiptModel
} from "../../model/types";
import { ComposicionSalarialModel } from "../composiciones/ComposicionesSalarialesPage";
import { LegajoModel } from "../legajos/LegajosPage";
import { LiquidacionConceptoRow, LiquidacionRecord, LiquidacionLegajoRow } from "./types";

interface LiquidacionesPageProps {
  concepts: ConceptModel[];
  receipts: ReceiptModel[];
  legajos: LegajoModel[];
  composiciones: ComposicionSalarialModel[];
}

const apiBaseUrl = "http://localhost:3001";
const virtualAllConvenio = "(Todos)";

function normalizeConvenio(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveComposicionLegajo(
  legajo: LegajoModel,
  composiciones: ComposicionSalarialModel[]
): ComposicionSalarialModel | undefined {
  const selected = (legajo.composicionSalarial ?? "").trim();
  if (!selected) return undefined;
  const byId = composiciones.find(
    (c) => c.id === selected && normalizeConvenio(c.convenio) === normalizeConvenio(legajo.convenio)
  );
  if (byId) return byId;
  return composiciones.find(
    (c) => c.code === selected && normalizeConvenio(c.convenio) === normalizeConvenio(legajo.convenio)
  );
}

export function LiquidacionesPage({ concepts, receipts, legajos, composiciones }: LiquidacionesPageProps) {
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionRecord[]>([]);
  const [selectedLiquidacionId, setSelectedLiquidacionId] = useState<string>("");
  const [selectedLegajoId, setSelectedLegajoId] = useState<string>("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<(typeof LIQUIDATION_TYPES)[number]>("Normal");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedLegajoIds, setSelectedLegajoIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>("Todos");
  const [filterMonth, setFilterMonth] = useState<string>("Todos");
  const [filterYear, setFilterYear] = useState<string>("Todos");
  const [filterEstado, setFilterEstado] = useState<"Todos" | "Generada" | "Anulada">("Generada");
  const blockedLegajoIdsForCreate = useMemo(() => {
    const blocked = new Set<string>();
    for (const liq of liquidaciones) {
      if (liq.estado === "Anulada") continue;
      if (liq.liquidationType !== selectedType) continue;
      if (liq.month !== selectedMonth) continue;
      if (liq.year !== selectedYear) continue;
      for (const legajoRow of liq.legajos) blocked.add(legajoRow.legajoId);
    }
    return blocked;
  }, [liquidaciones, selectedType, selectedMonth, selectedYear]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/liquidaciones`);
        if (!response.ok) return;
        const parsed = (await response.json()) as LiquidacionRecord[];
        setLiquidaciones(
          Array.isArray(parsed)
            ? parsed.map((item) => ({
                ...item,
                estado: item.estado === "Anulada" ? "Anulada" : "Generada"
              }))
            : []
        );
      } catch {
        // noop
      }
    };
    void load();
  }, []);

  const filteredLiquidaciones = useMemo(
    () =>
      liquidaciones.filter((item) => {
        if (filterEstado !== "Todos" && item.estado !== filterEstado) return false;
        if (filterType !== "Todos" && item.liquidationType !== filterType) return false;
        if (filterMonth !== "Todos" && String(item.month) !== filterMonth) return false;
        if (filterYear !== "Todos" && String(item.year) !== filterYear) return false;
        return true;
      }),
    [liquidaciones, filterEstado, filterType, filterMonth, filterYear]
  );
  const selectedLiquidacion = useMemo(
    () =>
      filteredLiquidaciones.find((item) => item.id === selectedLiquidacionId) ??
      filteredLiquidaciones[0] ??
      null,
    [filteredLiquidaciones, selectedLiquidacionId]
  );
  const yearOptions = useMemo(
    () =>
      Array.from(new Set(liquidaciones.map((item) => String(item.year))))
        .sort((a, b) => Number(b) - Number(a)),
    [liquidaciones]
  );
  const selectedLegajoLiquidado = useMemo(
    () =>
      selectedLiquidacion?.legajos.find((item) => item.legajoId === selectedLegajoId) ??
      selectedLiquidacion?.legajos[0] ??
      null,
    [selectedLiquidacion, selectedLegajoId]
  );

  useEffect(() => {
    if (!selectedLiquidacion) {
      if (selectedLiquidacionId) setSelectedLiquidacionId("");
      return;
    }
    if (selectedLiquidacion.id !== selectedLiquidacionId) setSelectedLiquidacionId(selectedLiquidacion.id);
  }, [selectedLiquidacion, selectedLiquidacionId]);

  const toggleLegajo = (legajoId: string) => {
    if (blockedLegajoIdsForCreate.has(legajoId)) return;
    setSelectedLegajoIds((prev) =>
      prev.includes(legajoId) ? prev.filter((id) => id !== legajoId) : [...prev, legajoId]
    );
  };

  const toggleAllLegajos = () => {
    const enabledLegajoIds = legajos
      .map((legajo) => legajo.id)
      .filter((id) => !blockedLegajoIdsForCreate.has(id));
    if (!enabledLegajoIds.length) {
      setSelectedLegajoIds([]);
      return;
    }
    const allEnabledSelected = enabledLegajoIds.every((id) => selectedLegajoIds.includes(id));
    if (allEnabledSelected) {
      setSelectedLegajoIds([]);
      return;
    }
    setSelectedLegajoIds(enabledLegajoIds);
  };

  const createLiquidacion = async () => {
    const targetLegajos = legajos.filter(
      (item) => selectedLegajoIds.includes(item.id) && !blockedLegajoIdsForCreate.has(item.id)
    );
    if (!targetLegajos.length) return;
    const conceptCodeById = Object.fromEntries(concepts.map((c) => [c.id, c.code])) as Record<number, string>;
    const hasUsableConcepts = (receipt: ReceiptModel | undefined): boolean =>
      [...(receipt?.definitiveOrder ?? []), ...(receipt?.transitoryOrder ?? [])].some((conceptId) =>
        concepts.some((c) => c.id === conceptId)
      );

    const legajoRows: LiquidacionLegajoRow[] = targetLegajos.map((legajo) => {
      const specificReceipt = receipts.find(
        (r) =>
          normalizeConvenio(r.convenio) === normalizeConvenio(legajo.convenio) &&
          r.liquidationType === selectedType
      );
      const allConveniosReceipt = receipts.find(
        (r) =>
          normalizeConvenio(r.convenio) === normalizeConvenio(virtualAllConvenio) &&
          r.liquidationType === selectedType
      );
      const specificHasConcepts = hasUsableConcepts(specificReceipt);
      const allHasConcepts = hasUsableConcepts(allConveniosReceipt);
      const receipt =
        !specificHasConcepts && allHasConcepts
          ? allConveniosReceipt
          : (specificReceipt ?? allConveniosReceipt);
      const inReceipt = new Set<number>([
        ...(receipt?.definitiveOrder ?? []),
        ...(receipt?.transitoryOrder ?? [])
      ]);
      const conceptScope = concepts.filter((c) => inReceipt.has(c.id));
      const composicion = resolveComposicionLegajo(legajo, composiciones);
      const evalResult = evaluateConcepts({
        concepts: conceptScope,
        conceptCodeById,
        legajo: {
          ...legajo,
          composicionValoresFijos: composicion?.valoresFijos ?? []
        },
        receiptOrderIds: [...(receipt?.definitiveOrder ?? []), ...(receipt?.transitoryOrder ?? [])],
        asOfMonth: selectedMonth,
        asOfYear: selectedYear
      });
      const mapConceptRows = (
        ids: number[],
        conceptClass: "definitivo" | "transitorio"
      ): LiquidacionConceptoRow[] =>
        ids
          .map((conceptId) => concepts.find((c) => c.id === conceptId))
          .filter((c): c is ConceptModel => Boolean(c))
          .map((concept) => {
            const value = evalResult.values.get(concept.id) ?? 0;
            return {
              conceptId: concept.id,
              conceptCode: concept.code,
              conceptName: concept.name,
              conceptClass,
              conceptTypeId: concept.conceptType,
              conceptColumn: getConceptTypeDefinition(concept.conceptType).column,
              conceptSign: getConceptTypeDefinition(concept.conceptType).sign,
              value,
              formulaUsed: formulaToExpression(astToTokens(concept.formulaAst ?? []))
            };
          });
      const definitiveRows = mapConceptRows(receipt?.definitiveOrder ?? [], "definitivo");
      const transitoryRows = mapConceptRows(receipt?.transitoryOrder ?? [], "transitorio");
      const conceptoRows = [...definitiveRows, ...transitoryRows];
      const total = conceptoRows.reduce(
        (acc, row) => acc + (typeof row.value === "number" && Number.isFinite(row.value) ? row.value : 0),
        0
      );
      return {
        legajoId: legajo.id,
        legajoNro: legajo.nroLegajo,
        legajoNombre: legajo.nombre,
        convenio: legajo.convenio,
        conceptos: conceptoRows,
        total
      };
    });

    const payload: LiquidacionRecord = {
      id: `liq_${selectedYear}_${selectedMonth}_${selectedType}_${Date.now()}`,
      liquidationType: selectedType,
      estado: "Generada",
      month: selectedMonth,
      year: selectedYear,
      createdAt: new Date().toISOString(),
      legajos: legajoRows
    };
    const response = await fetch(`${apiBaseUrl}/liquidaciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return;
    setLiquidaciones((prev) => [payload, ...prev]);
    setSelectedLiquidacionId(payload.id);
    setSelectedLegajoId(payload.legajos[0]?.legajoId ?? "");
    setCreateModalOpen(false);
  };

  useEffect(() => {
    setSelectedLegajoIds((prev) => prev.filter((id) => !blockedLegajoIdsForCreate.has(id)));
  }, [blockedLegajoIdsForCreate]);

  const anularLiquidacion = async () => {
    if (!selectedLiquidacion) return;
    if (selectedLiquidacion.estado === "Anulada") return;
    const ok = window.confirm(
      `¿Anular liquidación ${selectedLiquidacion.liquidationType} ${selectedLiquidacion.month}/${selectedLiquidacion.year}?`
    );
    if (!ok) return;
    let response = await fetch(`${apiBaseUrl}/liquidaciones/${selectedLiquidacion.id}/estado`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "Anulada" })
    });
    if (!response.ok) {
      // Compatibilidad con servidor previo (sin endpoint /estado).
      response = await fetch(`${apiBaseUrl}/liquidaciones/${selectedLiquidacion.id}`, {
        method: "DELETE"
      });
    }
    if (!response.ok) {
      window.alert("No se pudo anular la liquidación. Reintentá en unos segundos.");
      return;
    }
    setLiquidaciones((prev) =>
      prev.map((item) => (item.id === selectedLiquidacion.id ? { ...item, estado: "Anulada" } : item))
    );
  };

  const conceptClassById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept.conceptClass])),
    [concepts]
  );
  const conceptTypeById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept.conceptType])),
    [concepts]
  );
  const selectedLegajoConceptos = selectedLegajoLiquidado?.conceptos ?? [];
  const columnLabelByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const definition of CONCEPT_TYPE_DEFINITIONS) {
      if (!map.has(definition.column)) map.set(definition.column, definition.label);
    }
    return map;
  }, []);
  const conceptosPorColumna = useMemo(() => {
    const grouped = new Map<
      number,
      { conceptId: number; conceptCode: string; conceptName: string; value: unknown; typeId: ConceptTypeId }[]
    >();
    for (const row of selectedLegajoConceptos) {
      const resolvedClass = row.conceptClass ?? conceptClassById.get(row.conceptId) ?? "definitivo";
      if (resolvedClass === "transitorio") continue;
      const resolvedType = row.conceptTypeId ?? conceptTypeById.get(row.conceptId) ?? "remunerativo";
      const resolvedColumn = row.conceptColumn ?? getConceptTypeDefinition(resolvedType).column;
      const current = grouped.get(resolvedColumn) ?? [];
      current.push({
        conceptId: row.conceptId,
        conceptCode: row.conceptCode,
        conceptName: row.conceptName,
        value: row.value,
        typeId: resolvedType
      });
      grouped.set(resolvedColumn, current);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([column, rows]) => ({ column, rows }));
  }, [selectedLegajoConceptos, conceptTypeById, conceptClassById]);
  const conceptosTransitorios = useMemo(
    () =>
      selectedLegajoConceptos.filter(
        (row) => (row.conceptClass ?? conceptClassById.get(row.conceptId) ?? "definitivo") === "transitorio"
      ),
    [selectedLegajoConceptos, conceptClassById]
  );
  const totalPorColumna = useMemo(
    () =>
      new Map(
        conceptosPorColumna.map(({ column, rows }) => [
          column,
          rows.reduce(
            (acc, row) =>
              acc + (typeof row.value === "number" && Number.isFinite(row.value) ? row.value : 0),
            0
          )
        ])
      ),
    [conceptosPorColumna]
  );
  const totalGeneralConceptos = useMemo(
    () =>
      selectedLegajoConceptos.reduce(
        (acc, row) => acc + (typeof row.value === "number" && Number.isFinite(row.value) ? row.value : 0),
        0
      ),
    [selectedLegajoConceptos]
  );

  return (
    <section className="liquidaciones-grid">
      <div className="liquidaciones-left-column">
        <article className="panel">
        <h2>Liquidaciones</h2>
        <div className="receipt-toolbar liquidaciones-filter-toolbar">
          <div>
            <label>Estado</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as "Todos" | "Generada" | "Anulada")}
            >
              <option value="Todos">Todos</option>
              <option value="Generada">Generadas</option>
              <option value="Anulada">Anuladas</option>
            </select>
          </div>
          <div>
            <label>Tipo</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="Todos">Todos</option>
              {LIQUIDATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Mes</label>
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
              <option value="Todos">Todos</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={String(month)}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Año</label>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              <option value="Todos">Todos</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="panel-actions">
          <button
            className="add-button"
            onClick={() => setCreateModalOpen(true)}
            title="Crear una nueva liquidación"
          >
            Nueva liquidación
          </button>
          <button
            className="remove-inline-button liquidaciones-delete-button"
            onClick={anularLiquidacion}
            disabled={!selectedLiquidacion || selectedLiquidacion.estado === "Anulada"}
            title="Anular liquidación seleccionada"
          >
            🗑 Anular liquidación
          </button>
        </div>
        <ul className="concept-list">
          {filteredLiquidaciones.map((item) => (
            <li
              key={item.id}
              className={[
                "concept-item",
                item.estado === "Anulada" ? "liquidacion-item-anulada" : "",
                item.id === selectedLiquidacion?.id ? "selected" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedLiquidacionId(item.id)}
            >
              <div>
                <strong>{item.liquidationType}</strong> - {item.month}/{item.year}
                <span className="concept-meta-inline">
                  {item.estado} - {item.legajos.length} legajos
                </span>
              </div>
            </li>
          ))}
        </ul>
        </article>
      </div>

      <div className="liquidaciones-right-column">
        <article className="panel liquidaciones-detail-panel">
          <h2>Legajos Liquidados</h2>
          {!selectedLiquidacion ? (
            <p>No hay liquidaciones registradas.</p>
          ) : (
            <ul className="concept-list">
              {selectedLiquidacion.legajos.map((item) => (
                <li
                  key={item.legajoId}
                  className={item.legajoId === selectedLegajoLiquidado?.legajoId ? "concept-item selected" : "concept-item"}
                  onClick={() => setSelectedLegajoId(item.legajoId)}
                >
                  <div>
                    <strong>{item.legajoNro || "S/N"}</strong> - {item.legajoNombre || "Sin nombre"}
                  </div>
                  <span
                    className={`liquidacion-valor ${
                      typeof item.total === "number" ? (item.total < 0 ? "negativo" : "positivo") : ""
                    }`}
                  >
                    {typeof item.total === "number"
                      ? `$${item.total.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}`
                      : "$0,00"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel liquidaciones-detail-panel">
          <h2>Conceptos Liquidados</h2>
          {!selectedLiquidacion ? (
            <p>Seleccioná una liquidación para ver los conceptos.</p>
          ) : selectedLegajoLiquidado ? (
            <>
              <h3 className="liquidaciones-concepts-title">
                {selectedLegajoLiquidado.legajoNombre || "Sin nombre"} ({selectedLegajoLiquidado.legajoNro || "S/N"}) -{" "}
                {selectedLiquidacion.liquidationType} {selectedLiquidacion.month}/{selectedLiquidacion.year}
              </h3>
              {conceptosPorColumna.length ? (
                <div className="liquidaciones-concept-columns">
                  {conceptosPorColumna.map(({ column, rows }) => (
                    <article key={column} className="panel liquidaciones-column-panel">
                      <h3>
                        {columnLabelByNumber.get(column) ?? `Columna ${column}`}
                      </h3>
                      <ul className="concept-list">
                        {rows.map((row) => (
                          <li
                            key={`${selectedLegajoLiquidado.legajoId}-${column}-${row.conceptId}`}
                            className="concept-item"
                          >
                            <div>
                              <strong>{row.conceptCode}</strong> - {row.conceptName}
                            </div>
                            <span
                              className={`liquidacion-valor ${
                                typeof row.value === "number"
                                  ? row.value < 0
                                    ? "negativo"
                                    : "positivo"
                                  : ""
                              }`}
                            >
                              {typeof row.value === "number"
                                ? `$${row.value.toLocaleString("es-AR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}`
                                : String(row.value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="concept-item liquidaciones-total-row">
                        <div>
                          <strong>Total {columnLabelByNumber.get(column) ?? `columna ${column}`}</strong>
                        </div>
                        <span
                          className={`liquidacion-valor ${
                            (totalPorColumna.get(column) ?? 0) < 0 ? "negativo" : "positivo"
                          }`}
                        >
                          ${(totalPorColumna.get(column) ?? 0).toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No hay conceptos liquidados para este legajo.</p>
              )}
              <div className="concept-item liquidaciones-total-row">
                <div>
                  <strong>Total general</strong>
                </div>
                <span className={`liquidacion-valor ${totalGeneralConceptos < 0 ? "negativo" : "positivo"}`}>
                  ${totalGeneralConceptos.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              </div>
              {conceptosTransitorios.length ? (
                <article className="panel liquidaciones-transitory-panel">
                  <h3>Transitorios</h3>
                  <ul className="concept-list">
                    {conceptosTransitorios.map((row) => (
                      <li
                        key={`${selectedLegajoLiquidado.legajoId}-transitorio-${row.conceptId}`}
                        className="concept-item transitorio-item"
                      >
                        <div>
                          <strong>{row.conceptCode}</strong> - {row.conceptName}
                        </div>
                        <span
                          className={`liquidacion-valor ${
                            typeof row.value === "number" ? (row.value < 0 ? "negativo" : "positivo") : ""
                          }`}
                        >
                          {typeof row.value === "number"
                            ? `$${row.value.toLocaleString("es-AR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}`
                            : String(row.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ) : null}
            </>
          ) : (
            <p>Seleccioná un legajo para ver sus conceptos liquidados.</p>
          )}
        </article>
      </div>
      {createModalOpen ? (
        <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Nueva liquidación</h3>
            <div className="receipt-toolbar">
              <div>
                <label>Tipo</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as (typeof LIQUIDATION_TYPES)[number])}
                >
                  {LIQUIDATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Mes</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value || 1))}
                />
              </div>
              <div>
                <label>Año</label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value || new Date().getFullYear()))}
                />
              </div>
            </div>
            <div className="panel-actions">
              <button className="add-button" onClick={toggleAllLegajos}>
                {selectedLegajoIds.length ===
                legajos.map((legajo) => legajo.id).filter((id) => !blockedLegajoIdsForCreate.has(id)).length
                  ? "Quitar todos"
                  : "Seleccionar todos"}
              </button>
              <button className="add-button" onClick={createLiquidacion}>
                Ejecutar liquidación
              </button>
              <button className="remove-inline-button" onClick={() => setCreateModalOpen(false)}>
                Cerrar
              </button>
            </div>
            <ul className="concept-list">
              {legajos.map((legajo) => (
                <li
                  key={legajo.id}
                  className={
                    blockedLegajoIdsForCreate.has(legajo.id)
                      ? "concept-item liquidacion-legajo-disabled"
                      : "concept-item"
                  }
                >
                  <label style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                    <input
                      type="checkbox"
                      checked={selectedLegajoIds.includes(legajo.id)}
                      disabled={blockedLegajoIdsForCreate.has(legajo.id)}
                      onChange={() => toggleLegajo(legajo.id)}
                    />
                    <span>
                      <strong>{legajo.nroLegajo || "S/N"}</strong> - {legajo.nombre || "Sin nombre"} (
                      {legajo.convenio || "Sin convenio"})
                      {blockedLegajoIdsForCreate.has(legajo.id) ? " - ya liquidado" : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
