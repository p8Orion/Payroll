export interface GananciasInput {
    netoImponibleAnual: number;
    deduccionesAnuales: number;
}
export interface GananciasOutput {
    baseSujetaImpuesto: number;
    impuestoDeterminado: number;
}
export declare function calcularGanancias2026(input: GananciasInput): GananciasOutput;
