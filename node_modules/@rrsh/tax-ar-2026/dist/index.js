"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularGanancias2026 = calcularGanancias2026;
// Placeholder inicial. Reemplazar por tabla oficial 2026 versionada.
const tabla = [
    { hasta: 1000000, fijo: 0, alicuota: 0.05, excedenteDesde: 0 },
    { hasta: 2000000, fijo: 50000, alicuota: 0.09, excedenteDesde: 1000000 },
    { hasta: Number.POSITIVE_INFINITY, fijo: 140000, alicuota: 0.12, excedenteDesde: 2000000 }
];
function calcularGanancias2026(input) {
    const baseSujetaImpuesto = Math.max(0, input.netoImponibleAnual - input.deduccionesAnuales);
    const tramo = tabla.find((t) => baseSujetaImpuesto <= t.hasta);
    const impuestoDeterminado = tramo.fijo + (baseSujetaImpuesto - tramo.excedenteDesde) * tramo.alicuota;
    return {
        baseSujetaImpuesto,
        impuestoDeterminado: Math.max(0, impuestoDeterminado)
    };
}
