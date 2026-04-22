export interface GananciasInput {
  netoImponibleAnual: number;
  deduccionesAnuales: number;
}

export interface GananciasOutput {
  baseSujetaImpuesto: number;
  impuestoDeterminado: number;
}

interface Tramo {
  hasta: number;
  fijo: number;
  alicuota: number;
  excedenteDesde: number;
}

// Placeholder inicial. Reemplazar por tabla oficial 2026 versionada.
const tabla: Tramo[] = [
  { hasta: 1000000, fijo: 0, alicuota: 0.05, excedenteDesde: 0 },
  { hasta: 2000000, fijo: 50000, alicuota: 0.09, excedenteDesde: 1000000 },
  { hasta: Number.POSITIVE_INFINITY, fijo: 140000, alicuota: 0.12, excedenteDesde: 2000000 }
];

export function calcularGanancias2026(input: GananciasInput): GananciasOutput {
  const baseSujetaImpuesto = Math.max(0, input.netoImponibleAnual - input.deduccionesAnuales);
  const tramo = tabla.find((t) => baseSujetaImpuesto <= t.hasta)!;
  const impuestoDeterminado =
    tramo.fijo + (baseSujetaImpuesto - tramo.excedenteDesde) * tramo.alicuota;

  return {
    baseSujetaImpuesto,
    impuestoDeterminado: Math.max(0, impuestoDeterminado)
  };
}
