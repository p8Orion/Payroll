"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPayroll = runPayroll;
const formula_engine_1 = require("@rrsh/formula-engine");
function runPayroll(input) {
    const byId = new Map(input.concepts.map((c) => [c.id, c]));
    const byCode = new Map(input.concepts.map((c) => [c.code, c]));
    const idByCode = new Map(input.concepts.map((c) => [c.code, c.id]));
    const nodes = input.concepts.map((c) => c.id);
    const edges = [];
    for (const concept of input.concepts) {
        if (!concept.formula)
            continue;
        const deps = (0, formula_engine_1.extractDependencies)(concept.formula);
        for (const depId of deps.conceptIds) {
            edges.push([depId, concept.id]);
        }
        for (const depCode of deps.conceptCodes) {
            const depId = idByCode.get(depCode);
            if (!depId)
                throw new Error(`Concepto referenciado inexistente: ${depCode}`);
            edges.push([depId, concept.id]);
        }
    }
    const executionOrder = (0, formula_engine_1.topologicalSort)(nodes, edges);
    const valuesByConceptId = {};
    const valuesByConceptCode = {};
    const sumsByTag = {};
    const results = [];
    for (const conceptId of executionOrder) {
        const concept = byId.get(conceptId);
        const fixedValue = input.fixedValuesByCode?.[concept.code];
        const ctx = {
            valuesByConceptCode,
            valuesByConceptId,
            params: input.params,
            sumsByTag
        };
        const value = fixedValue ?? (concept.formula ? (0, formula_engine_1.evaluateFormula)(concept.formula, ctx) : 0);
        valuesByConceptId[concept.id] = value;
        valuesByConceptCode[concept.code] = value;
        for (const tag of concept.tags) {
            sumsByTag[tag] = (sumsByTag[tag] ?? 0) + value;
        }
        results.push({
            conceptId: concept.id,
            code: concept.code,
            value,
            conceptClass: concept.conceptClass,
            trace: [
                `concept=${concept.code}`,
                `class=${concept.conceptClass}`,
                `formula=${concept.formula ?? "fixed_or_zero"}`
            ]
        });
    }
    // Verificacion defensiva para detectar inconsistencias de carga.
    for (const concept of input.concepts) {
        if (!byCode.has(concept.code)) {
            throw new Error(`Concepto no indexado: ${concept.code}`);
        }
    }
    return { results, sumsByTag };
}
