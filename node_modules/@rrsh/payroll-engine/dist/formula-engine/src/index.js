"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDependencies = extractDependencies;
exports.evaluateFormula = evaluateFormula;
exports.topologicalSort = topologicalSort;
const conceptByIdRegex = /CONCEPTO\((\d+)\)/g;
const conceptByCodeRegex = /CCONCEPTO\("([^"]+)"\)/g;
const sumTagRegex = /SUM_TAG\("([^"]+)"\)/g;
const paramRegex = /PARAM\("([^"]+)"\)/g;
function extractDependencies(formula) {
    const ids = [...formula.matchAll(conceptByIdRegex)].map((m) => Number(m[1]));
    const codes = [...formula.matchAll(conceptByCodeRegex)].map((m) => m[1]);
    const tags = [...formula.matchAll(sumTagRegex)].map((m) => m[1]);
    const params = [...formula.matchAll(paramRegex)].map((m) => m[1]);
    return {
        conceptIds: [...new Set(ids)],
        conceptCodes: [...new Set(codes)],
        tags: [...new Set(tags)],
        params: [...new Set(params)]
    };
}
function evaluateFormula(formula, ctx) {
    const normalized = formula
        .replace(conceptByIdRegex, (_, id) => String(ctx.valuesByConceptId[Number(id)] ?? 0))
        .replace(conceptByCodeRegex, (_, code) => String(ctx.valuesByConceptCode[code] ?? 0))
        .replace(sumTagRegex, (_, tag) => String(ctx.sumsByTag[tag] ?? 0))
        .replace(paramRegex, (_, name) => String(ctx.params[name] ?? 0));
    // Se evalua formula ya normalizada y controlada por DSL.
    const value = Function(`"use strict"; return (${normalized});`)();
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`Formula invalida: ${formula}`);
    }
    return value;
}
function topologicalSort(nodes, edges) {
    const incoming = new Map();
    const outgoing = new Map();
    for (const node of nodes) {
        incoming.set(node, 0);
        outgoing.set(node, []);
    }
    for (const [from, to] of edges) {
        incoming.set(to, (incoming.get(to) ?? 0) + 1);
        outgoing.get(from)?.push(to);
    }
    const queue = nodes.filter((n) => (incoming.get(n) ?? 0) === 0);
    const sorted = [];
    while (queue.length > 0) {
        const current = queue.shift();
        sorted.push(current);
        for (const next of outgoing.get(current) ?? []) {
            incoming.set(next, (incoming.get(next) ?? 0) - 1);
            if ((incoming.get(next) ?? 0) === 0) {
                queue.push(next);
            }
        }
    }
    if (sorted.length !== nodes.length) {
        throw new Error("Dependencias ciclicas detectadas en formulas.");
    }
    return sorted;
}
