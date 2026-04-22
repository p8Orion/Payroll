# RRSH Payroll MVP

MVP de liquidacion de sueldos para Argentina 2026, extensible por convenio.

## Alcance inicial

- Conceptos `definitivo` y `transitorio` compartiendo formulas.
- DAG de dependencias calculado automaticamente por formula.
- Agregaciones por tags (`SUM_TAG`).
- Base para mapeo AFIP/contable.
- Motor fiscal separado para Ganancias 4ta 2026.

## Estructura

- `apps/api`: API backend.
- `apps/web`: UI inicial para mantenimiento y formulas.
- `packages/shared-types`: tipos comunes del dominio.
- `packages/formula-engine`: parser/evaluador de formulas y DAG.
- `packages/payroll-engine`: ejecucion de liquidaciones.
- `packages/tax-ar-2026`: calculo de ganancias 4ta.
- `packages/domain`: repositorios y entidades.
