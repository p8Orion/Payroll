import { useEffect, useMemo, useState } from "react";
import { formulaToExpression } from "../../model/helpers";
import { astToTokens } from "../../model/formula-dnd";
import { evaluateConcepts } from "../../model/liquidation-eval";
import { ConceptModel, LIQUIDATION_TYPES, ReceiptModel } from "../../model/types";
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
  const [selectedType, setSelectedType] = useState<(typeof LIQUIDATION_TYPES)[number]>("Normal");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedLegajoIds, setSelectedLegajoIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>("Todos");
  const [filterMonth, setFilterMonth] = useState<string>("Todos");
  const [filterYear, setFilterYear] = useState<string>("Todos");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/liquidaciones`);
        if (!response.ok) return;
        const parsed = (await response.json()) as LiquidacionRecord[];
        setLiquidaciones(Array.isArray(parsed) ? parsed : []);
      } catch {
        // noop
      }
    };
    void load();
  }, []);

  const selectedLiquidacion = useMemo(
    () => liquidaciones.find((item) => item.id === selectedLiquidacionId) ?? liquidaciones[0] ?? null,
    [liquidaciones, selectedLiquidacionId]
  );
  const yearOptions = useMemo(
    () =>
      Array.from(new Set(liquidaciones.map((item) => String(item.year))))
        .sort((a, b) => Number(b) - Number(a)),
    [liquidaciones]
  );
  const filteredLiquidaciones = useMemo(
    () =>
      liquidaciones.filter((item) => {
        if (filterType !== "Todos" && item.liquidationType !== filterType) return false;
        if (filterMonth !== "Todos" && String(item.month) !== filterMonth) return false;
        if (filterYear !== "Todos" && String(item.year) !== filterYear) return false;
        return true;
      }),
    [liquidaciones, filterType, filterMonth, filterYear]
  );
  const selectedLegajoLiquidado = useMemo(
    () =>
      selectedLiquidacion?.legajos.find((item) => item.legajoId === selectedLegajoId) ??
      selectedLiquidacion?.legajos[0] ??
      null,
    [selectedLiquidacion, selectedLegajoId]
  );

  useEffect(() => {
    if (!selectedLiquidacion) return;
    if (!selectedLiquidacionId) setSelectedLiquidacionId(selectedLiquidacion.id);
  }, [selectedLiquidacion, selectedLiquidacionId]);

  const toggleLegajo = (legajoId: string) => {
    setSelectedLegajoIds((prev) =>
      prev.includes(legajoId) ? prev.filter((id) => id !== legajoId) : [...prev, legajoId]
    );
  };

  const toggleAllLegajos = () => {
    if (selectedLegajoIds.length === legajos.length) {
      setSelectedLegajoIds([]);
      return;
    }
    setSelectedLegajoIds(legajos.map((legajo) => legajo.id));
  };

  const createLiquidacion = async () => {
    const targetLegajos = legajos.filter((item) => selectedLegajoIds.includes(item.id));
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
        }
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
              value,
              formulaUsed: formulaToExpression(astToTokens(concept.formulaAst ?? []))
            };
          });
      const definitiveRows = mapConceptRows(receipt?.definitiveOrder ?? [], "definitivo");
      const transitoryRows = mapConceptRows(receipt?.transitoryOrder ?? [], "transitorio");
      const conceptoRows = [...definitiveRows, ...transitoryRows];
      const total = definitiveRows.reduce((acc, row) => acc + (typeof row.value === "number" ? row.value : 0), 0);
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
  };

  const deleteLiquidacion = async () => {
    if (!selectedLiquidacion) return;
    const ok = window.confirm(
      `¿Borrar liquidación ${selectedLiquidacion.liquidationType} ${selectedLiquidacion.month}/${selectedLiquidacion.year}?`
    );
    if (!ok) return;
    const response = await fetch(`${apiBaseUrl}/liquidaciones/${selectedLiquidacion.id}`, {
      method: "DELETE"
    });
    if (!response.ok) return;
    const next = liquidaciones.filter((item) => item.id !== selectedLiquidacion.id);
    setLiquidaciones(next);
    setSelectedLiquidacionId(next[0]?.id ?? "");
    setSelectedLegajoId(next[0]?.legajos[0]?.legajoId ?? "");
  };

  const conceptClassById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept.conceptClass])),
    [concepts]
  );
  const selectedLegajoConceptos = selectedLegajoLiquidado?.conceptos ?? [];
  const definitiveConceptRows = selectedLegajoConceptos.filter((row) => {
    const resolvedClass = row.conceptClass ?? conceptClassById.get(row.conceptId);
    return resolvedClass !== "transitorio";
  });
  const transitoryConceptRows = selectedLegajoConceptos.filter((row) => {
    const resolvedClass = row.conceptClass ?? conceptClassById.get(row.conceptId);
    return resolvedClass === "transitorio";
  });

  return (
    <section className="liquidaciones-grid">
      <div className="liquidaciones-left-column">
        <article className="panel">
        <h2>Liquidaciones</h2>
        <div className="receipt-toolbar">
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
            className="remove-inline-button"
            onClick={deleteLiquidacion}
            disabled={!selectedLiquidacion}
            title="Borrar liquidación seleccionada"
          >
            Borrar liquidación
          </button>
        </div>
        <ul className="concept-list">
          {filteredLiquidaciones.map((item) => (
            <li
              key={item.id}
              className={item.id === selectedLiquidacion?.id ? "concept-item selected" : "concept-item"}
              onClick={() => setSelectedLiquidacionId(item.id)}
            >
              <div>
                <strong>{item.liquidationType}</strong> - {item.month}/{item.year}
                <span className="concept-meta-inline">{item.legajos.length} legajos</span>
              </div>
            </li>
          ))}
        </ul>
        </article>

        <article className="panel">
        <h2>Nueva liquidación</h2>
        <div className="receipt-toolbar">
          <div>
            <label>Tipo</label>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value as (typeof LIQUIDATION_TYPES)[number])}>
              {LIQUIDATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Mes</label>
            <input type="number" min={1} max={12} value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value || 1))} />
          </div>
          <div>
            <label>Año</label>
            <input type="number" min={2000} max={2100} value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value || new Date().getFullYear()))} />
          </div>
        </div>
        <div className="panel-actions">
          <button className="add-button" onClick={toggleAllLegajos}>
            {selectedLegajoIds.length === legajos.length ? "Quitar todos" : "Seleccionar todos"}
          </button>
          <button className="add-button" onClick={createLiquidacion}>
            Ejecutar liquidación
          </button>
        </div>
        <ul className="concept-list">
          {legajos.map((legajo) => (
            <li key={legajo.id} className="concept-item">
              <label style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                <input
                  type="checkbox"
                  checked={selectedLegajoIds.includes(legajo.id)}
                  onChange={() => toggleLegajo(legajo.id)}
                />
                <span>
                  <strong>{legajo.nroLegajo || "S/N"}</strong> - {legajo.nombre || "Sin nombre"} ({legajo.convenio || "Sin convenio"})
                </span>
              </label>
            </li>
          ))}
        </ul>
        </article>
      </div>

      <article className="panel liquidaciones-detail-panel">
        <h2>Detalle</h2>
        {!selectedLiquidacion ? (
          <p>No hay liquidaciones registradas.</p>
        ) : (
          <>
            <h3>Legajos liquidados</h3>
            <ul className="concept-list">
              {selectedLiquidacion.legajos.map((item) => (
                <li
                  key={item.legajoId}
                  className={item.legajoId === selectedLegajoLiquidado?.legajoId ? "concept-item selected" : "concept-item"}
                  onClick={() => setSelectedLegajoId(item.legajoId)}
                >
                  <strong>{item.legajoNro || "S/N"}</strong> - {item.legajoNombre || "Sin nombre"}
                </li>
              ))}
            </ul>
            {selectedLegajoLiquidado ? (
              <>
                <h3 className="liquidaciones-concepts-title">
                  Conceptos liquidados - {selectedLegajoLiquidado.legajoNombre || "Sin nombre"} (
                  {selectedLegajoLiquidado.legajoNro || "S/N"}) - {selectedLiquidacion.liquidationType}{" "}
                  {selectedLiquidacion.month}/{selectedLiquidacion.year}
                </h3>
                <ul className="concept-list">
                  {definitiveConceptRows.map((row) => (
                    <li key={`${selectedLegajoLiquidado.legajoId}-${row.conceptId}`} className="concept-item">
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
                {transitoryConceptRows.length ? (
                  <>
                    <hr />
                    <h3>Conceptos transitorios</h3>
                    <ul className="concept-list">
                      {transitoryConceptRows.map((row) => (
                        <li
                          key={`${selectedLegajoLiquidado.legajoId}-${row.conceptId}`}
                          className="concept-item transitorio-item"
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
                  </>
                ) : null}
                <p>
                  <strong>
                    Total: $
                    {selectedLegajoLiquidado.total.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </strong>
                </p>
              </>
            ) : null}
          </>
        )}
      </article>
    </section>
  );
}
