import { useMemo, useState } from "react";
import { LegajoModel } from "../legajos/LegajosPage";
import { ConceptModel, F1359FieldModel } from "../../model/types";

export interface HistoricalLiquidacionRecord {
  id?: string;
  liquidationType: string;
  estado?: "Generada" | "Anulada";
  month: number;
  year: number;
  createdAt?: string;
  legajos: Array<{
    legajoId: string;
    legajoNro?: string;
    legajoNombre?: string;
    conceptos: Array<{ conceptId?: number; conceptCode?: string; value: unknown }>;
  }>;
}

interface F1359InfoPageProps {
  concepts: ConceptModel[];
  legajos: LegajoModel[];
  liquidaciones: HistoricalLiquidacionRecord[];
  f1359Fields: F1359FieldModel[];
}

function padLeft(value: string, length: number, fill = "0"): string {
  return value.length >= length ? value.slice(0, length) : `${fill.repeat(length - value.length)}${value}`;
}

function padRight(value: string, length: number, fill = " "): string {
  return value.length >= length ? value.slice(0, length) : `${value}${fill.repeat(length - value.length)}`;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function asTextValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function formatNumeric(value: number, length: number): string {
  const scaled = Math.round(value * 100);
  const sign = scaled < 0 ? "-" : "";
  const digits = `${Math.abs(scaled)}`;
  const available = Math.max(1, length - sign.length);
  const padded = padLeft(digits, available, "0");
  return `${sign}${padded}`.slice(-length);
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function resolveWorkerCuil(legajo: LegajoModel | undefined): string {
  if (!legajo) return "00000000000";
  const fromFixed = (legajo.valoresFijos ?? []).find((item) => item.clave.trim().toLowerCase() === "cuil");
  const candidate = onlyDigits(fromFixed?.valor ? String(fromFixed.valor) : legajo.nroLegajo ?? "");
  return padLeft(candidate, 11, "0").slice(0, 11);
}

export function F1359InfoPage({ concepts, legajos, liquidaciones, f1359Fields }: F1359InfoPageProps) {
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [preview, setPreview] = useState("");

  const fieldsByRegistro = useMemo(() => {
    const map = new Map<string, F1359FieldModel[]>();
    for (const field of f1359Fields) {
      const current = map.get(field.registro) ?? [];
      current.push(field);
      map.set(field.registro, current);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.posicionInicial - b.posicionInicial);
    }
    return map;
  }, [f1359Fields]);

  const conceptFieldById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept.f1359FieldId ?? ""])),
    [concepts]
  );
  const legajoById = useMemo(() => new Map(legajos.map((item) => [item.id, item])), [legajos]);

  const nonCancelled = useMemo(
    () =>
      liquidaciones.filter(
        (item) => item.year === year && item.month === month && (item.estado ?? "Generada") !== "Anulada"
      ),
    [liquidaciones, year, month]
  );

  const workerRows = useMemo(
    () =>
      nonCancelled.flatMap((liq) =>
        liq.legajos.map((legajoRow) => ({
          liquidationType: liq.liquidationType,
          legajoId: legajoRow.legajoId,
          conceptos: legajoRow.conceptos
        }))
      ),
    [nonCancelled]
  );

  const buildLine = (registro: string, valuesByFieldId: Map<string, string>): string => {
    const fields = fieldsByRegistro.get(registro) ?? [];
    const totalLength = fields.length ? Math.max(...fields.map((f) => f.posicionFinal)) : 0;
    if (!totalLength) return "";
    const buffer = Array.from({ length: totalLength }, () => " ");
    for (const field of fields) {
      const raw = valuesByFieldId.get(field.id) ?? "";
      const isNumeric =
        field.descripcion.toLowerCase().includes("total") ||
        field.longitud === 15 ||
        field.descripcion.toLowerCase().includes("impuesto") ||
        field.descripcion.toLowerCase().includes("remuneración");
      const formatted = isNumeric ? padLeft(onlyDigits(raw), field.longitud, "0") : padRight(raw, field.longitud, " ");
      const start = field.posicionInicial - 1;
      for (let i = 0; i < field.longitud; i += 1) {
        buffer[start + i] = formatted[i] ?? " ";
      }
    }
    return buffer.join("");
  };

  const generateTxt = () => {
    if (!workerRows.length) {
      setPreview("");
      window.alert("No hay liquidaciones no anuladas para el período seleccionado.");
      return;
    }

    const header = new Map<string, string>();
    header.set("REG01_CAMPO01", "01");
    header.set("REG01_CAMPO02", "00000000000");
    header.set("REG01_CAMPO03", `${year}${padLeft(String(month), 2, "0")}`);
    header.set("REG01_CAMPO04", "00");
    header.set("REG01_CAMPO05", "0103");
    header.set("REG01_CAMPO06", "593");
    header.set("REG01_CAMPO07", "1359");
    header.set("REG01_CAMPO08", "2");
    header.set("REG01_CAMPO09", "00200");

    const lines: string[] = [buildLine("01", header)];

    for (const row of workerRows) {
      const legajo = legajoById.get(row.legajoId);
      const cuil = resolveWorkerCuil(legajo);
      const valuesByField = new Map<string, number>();

      for (const concepto of row.conceptos) {
        const mappedFieldId =
          (concepto.conceptId !== undefined ? conceptFieldById.get(concepto.conceptId) : "") ?? "";
        if (!mappedFieldId) continue;
        const numeric = Number(concepto.value);
        if (!Number.isFinite(numeric)) continue;
        valuesByField.set(mappedFieldId, (valuesByField.get(mappedFieldId) ?? 0) + numeric);
      }

      const baseByRegistro = (registro: string) => {
        const map = new Map<string, string>();
        map.set(`REG${registro}_CAMPO01`, registro);
        map.set(`REG${registro}_CAMPO02`, cuil);
        return map;
      };

      const reg02 = baseByRegistro("02");
      reg02.set("REG02_CAMPO03", `${year}${padLeft(String(month), 2, "0")}01`);
      reg02.set("REG02_CAMPO04", `${year}${padLeft(String(month), 2, "0")}28`);
      reg02.set("REG02_CAMPO05", "00");

      const registros = ["03", "04", "05", "06", "07", "08"];
      lines.push(buildLine("02", reg02));
      for (const registro of registros) {
        const map = baseByRegistro(registro);
        for (const [fieldId, value] of valuesByField.entries()) {
          if (!fieldId.startsWith(`REG${registro}_`)) continue;
          map.set(fieldId, formatNumeric(value, 15));
        }
        if (registro === "08") {
          const autoRet = valuesByField.get("REG08_CAMPO08") ?? 0;
          map.set("REG08_CAMPO08", formatNumeric(autoRet, 15));
        }
        lines.push(buildLine(registro, map));
      }
    }

    const text = lines.filter(Boolean).join("\r\n");
    setPreview(text);
    downloadTextFile(`F1359_${year}_${padLeft(String(month), 2, "0")}.txt`, text);
  };

  return (
    <section className="panel">
      <h2>Información - F1359</h2>
      <div className="receipt-toolbar">
        <div>
          <label>Año</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || today.getFullYear()))} />
        </div>
        <div>
          <label>Mes</label>
          <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value || 1))} />
        </div>
        <div>
          <label>Liquidaciones no anuladas</label>
          <input value={String(nonCancelled.length)} readOnly />
        </div>
        <div>
          <label>Acción</label>
          <button className="add-button" onClick={generateTxt}>
            Generar TXT F1359
          </button>
        </div>
      </div>
      <p className="formula-placeholder">
        Se suman conceptos por trabajador usando el campo asignado en el editor de conceptos (`f1359FieldId`).
      </p>
      <textarea
        className="formula-text-live-input"
        style={{ minHeight: 220, marginTop: 10 }}
        value={preview}
        readOnly
        placeholder="La vista previa del TXT aparece acá luego de generar."
      />
    </section>
  );
}
