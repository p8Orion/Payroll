import { GananciasTrace } from "./gananciasEngine";

interface GananciasTracePanelProps {
  trace: GananciasTrace;
  formatPreviewAmount: (value: unknown) => string;
  getF1359FieldLabel: (fieldId: string) => string;
}

export function GananciasTracePanel({ trace, formatPreviewAmount, getF1359FieldLabel }: GananciasTracePanelProps) {
  return (
    <details style={{ marginTop: 12, borderTop: "1px dashed #d5deee", paddingTop: 10 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Explicación Ganancias (simulada) </summary>
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13 }}>
          Se toman los conceptos con campo `f1359FieldId`, se agrupan por registro y se calcula el retenido/reintegrado final.
        </div>
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
              {trace.steps.map((step) => (
                <tr key={`gan-step-${step.conceptId}`}>
                  <td style={{ padding: "4px 0" }}>{`Reg ${step.registro}`}</td>
                  <td>{`${step.conceptCode} - ${step.conceptName}`}</td>
                  <td>{getF1359FieldLabel(step.f1359FieldId)}</td>
                  <td style={{ textAlign: "right" }}>{formatPreviewAmount(step.value)}</td>
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
              <tr><td>Remuneración gravada acumulada</td><td style={{ textAlign: "right" }}>{formatPreviewAmount(trace.grouped.remuneracionGravada)}</td></tr>
              <tr><td>Deducciones por conceptos</td><td style={{ textAlign: "right" }}>{formatPreviewAmount(trace.grouped.deduccionesConceptos)}</td></tr>
              <tr><td>Deducciones de tabla (mes)</td><td style={{ textAlign: "right" }}>{formatPreviewAmount(trace.grouped.deduccionesTabla)}</td></tr>
              {trace.grouped.deduccionesTablaItems.map((item) => (
                <tr key={`ded-tab-${item.label}`}>
                  <td style={{ paddingLeft: 16 }}>{item.label}</td>
                  <td style={{ textAlign: "right" }}>{formatPreviewAmount(item.value)}</td>
                </tr>
              ))}
              <tr><td>Deducciones F572</td><td style={{ textAlign: "right" }}>{formatPreviewAmount(trace.grouped.deduccionesF572)}</td></tr>
              <tr><td>Base imponible</td><td style={{ textAlign: "right" }}>{formatPreviewAmount(trace.grouped.baseImponible)}</td></tr>
              <tr><td>Impuesto determinado acumulado</td><td style={{ textAlign: "right" }}>{formatPreviewAmount(trace.grouped.impuestoDeterminadoAcumulado)}</td></tr>
              <tr><td>Impuesto pagado en meses anteriores</td><td style={{ textAlign: "right" }}>{formatPreviewAmount(trace.grouped.retencionesPrevias)}</td></tr>
              <tr>
                <td style={{ fontWeight: 700, borderTop: "1px solid #d5deee", paddingTop: 6 }}>A retener/reintegrar en el mes</td>
                <td style={{ textAlign: "right", fontWeight: 700, borderTop: "1px solid #d5deee", paddingTop: 6 }}>
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
              <tr>
                <td>Fuente de escala</td>
                <td>Tabla del mes de simulación (DB)</td>
              </tr>
              <tr>
                <td>Tramo</td>
                <td>
                  {`Más de ${formatPreviewAmount(trace.grouped.escalaAplicada.fromAmount)} `}
                  {trace.grouped.escalaAplicada.toAmount === null
                    ? "en adelante"
                    : `a ${formatPreviewAmount(trace.grouped.escalaAplicada.toAmount)}`}
                </td>
              </tr>
              <tr>
                <td>Fórmula de impuesto</td>
                <td>
                  {`${formatPreviewAmount(trace.grouped.escalaAplicada.fixedTax)} + (${formatPreviewAmount(trace.grouped.escalaAplicada.excedente)} * ${trace.grouped.escalaAplicada.percentRate.toFixed(2)}%) = ${formatPreviewAmount(trace.grouped.impuestoDeterminadoAcumulado)}`}
                </td>
              </tr>
              <tr>
                <td>Excedente sobre</td>
                <td>{formatPreviewAmount(trace.grouped.escalaAplicada.excessOver)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
