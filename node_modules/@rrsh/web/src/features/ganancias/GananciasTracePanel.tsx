import { GananciasTrace } from "./gananciasEngine";

interface GananciasTracePanelProps {
  trace: GananciasTrace;
  formatPreviewAmount: (value: unknown) => string;
  getF1359FieldLabel: (fieldId: string) => string;
  collapsible?: boolean;
  title?: string;
}

export function GananciasTracePanel({
  trace,
  formatPreviewAmount,
  getF1359FieldLabel,
  collapsible = true,
  title = "Explicación Ganancias (simulada)"
}: GananciasTracePanelProps) {
  const zebra = (index: number) => ({ background: index % 2 === 0 ? "#ffffff" : "#f8fbff" });
  const numberCellStyle = {
    textAlign: "right" as const,
    fontFamily: 'Consolas, "Courier New", monospace',
    fontVariantNumeric: "tabular-nums"
  };
  const subtotalRows: Array<{ label: string; value: number; level?: 0 | 1; strong?: boolean }> = [
    { label: "Remuneración gravada acumulada", value: trace.grouped.remuneracionGravada, level: 0, strong: true },
    { label: "Liquidaciones anteriores del año", value: trace.grouped.remuneracionGravadaLiquidacionesPrevias, level: 1 },
    { label: "Mes actual simulado/liquidado", value: trace.grouped.remuneracionGravadaMesActual, level: 1 },
    { label: "Deducciones por conceptos", value: trace.grouped.deduccionesConceptos, level: 0, strong: true },
    { label: "Liquidaciones anteriores del año", value: trace.grouped.deduccionesConceptosLiquidacionesPrevias, level: 1 },
    { label: "Mes actual simulado/liquidado", value: trace.grouped.deduccionesConceptosMesActual, level: 1 },
    { label: "Deducciones de tabla (mes)", value: trace.grouped.deduccionesTabla, level: 0, strong: true },
    ...trace.grouped.deduccionesTablaItems.map((item) => ({ label: item.label, value: item.value, level: 1 as const })),
    { label: "Deducciones F572", value: trace.grouped.deduccionesF572, level: 0 },
    { label: "Base imponible", value: trace.grouped.baseImponible, level: 0 },
    { label: "Impuesto determinado acumulado", value: trace.grouped.impuestoDeterminadoAcumulado, level: 0 },
    { label: "Impuesto pagado en meses anteriores", value: trace.grouped.retencionesPrevias, level: 0 }
  ];
  const escalaRows: Array<{ label: string; detail: string }> = [
    { label: "Fuente de escala", detail: "Tabla del mes de simulación (DB)" },
    {
      label: "Tramo",
      detail:
        `Más de ${formatPreviewAmount(trace.grouped.escalaAplicada.fromAmount)} ` +
        (trace.grouped.escalaAplicada.toAmount === null
          ? "en adelante"
          : `a ${formatPreviewAmount(trace.grouped.escalaAplicada.toAmount)}`) +
        ` (${trace.grouped.escalaAplicada.percentRate.toFixed(2)}%)`
    },
    { label: "Monto fijo", detail: formatPreviewAmount(trace.grouped.escalaAplicada.fixedTax) },
    { label: "Excedente sobre", detail: formatPreviewAmount(trace.grouped.escalaAplicada.excessOver) },
    {
      label: "Excedente imponible",
      detail:
        `${formatPreviewAmount(trace.grouped.baseImponible)} - ` +
        `${formatPreviewAmount(trace.grouped.escalaAplicada.excessOver)} = ` +
        `${formatPreviewAmount(trace.grouped.escalaAplicada.excedente)}`
    },
    {
      label: "Fórmula de impuesto",
      detail:
        `${formatPreviewAmount(trace.grouped.escalaAplicada.fixedTax)} + (` +
        `${formatPreviewAmount(trace.grouped.escalaAplicada.excedente)} * ` +
        `${trace.grouped.escalaAplicada.percentRate.toFixed(2)}%) = ` +
        `${formatPreviewAmount(trace.grouped.impuestoDeterminadoAcumulado)}`
    }
  ];

  const body = (
    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d5deee" }}>Paso</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d5deee" }}>Concepto</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d5deee" }}>Campo F1359</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #d5deee" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {trace.steps.map((step, index) => (
                <tr key={`gan-step-${step.conceptId}`} style={zebra(index)}>
                  <td style={{ padding: "4px 0" }}>{`Reg ${step.registro}`}</td>
                  <td>{`${step.conceptCode} - ${step.conceptName}`}</td>
                  <td>{getF1359FieldLabel(step.f1359FieldId)}</td>
                  <td style={numberCellStyle}>{formatPreviewAmount(step.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d5deee" }}>Subtotales (acumulados)</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #d5deee" }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {subtotalRows.map((row, index) => {
                const level = row.level ?? 0;
                return (
                  <tr key={`subtotal-row-${index}`} style={zebra(index)}>
                    <td style={{ paddingLeft: level * 18, fontWeight: row.strong ? 700 : 400, color: level === 1 ? "#42526b" : undefined }}>
                      {row.label}
                    </td>
                    <td
                      style={{
                        ...numberCellStyle,
                        paddingRight: level * 28,
                        fontWeight: row.strong ? 700 : 400,
                        color: level === 1 ? "#42526b" : undefined
                      }}
                    >
                      {formatPreviewAmount(row.value)}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ fontWeight: 700, borderTop: "1px solid #d5deee", paddingTop: 6 }}>A retener/reintegrar en el mes</td>
                <td style={{ ...numberCellStyle, fontWeight: 700, borderTop: "1px solid #d5deee", paddingTop: 6 }}>
                  {formatPreviewAmount(trace.grouped.aRetenerEnMes)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d5deee" }}>Escala aplicada</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d5deee" }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {escalaRows.map((row, index) => (
                <tr key={`escala-row-${row.label}`} style={zebra(index)}>
                  <td>{row.label}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  );

  if (!collapsible) {
    return (
      <div>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {body}
      </div>
    );
  }

  return (
    <details style={{ marginTop: 12, borderTop: "1px dashed #d5deee", paddingTop: 10 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{title}</summary>
      {body}
    </details>
  );
}
