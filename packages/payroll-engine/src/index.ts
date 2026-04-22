import { evaluateFormula, extractDependencies, topologicalSort } from "@rrsh/formula-engine";
import { ConceptDefinition, ConceptResult, PayrollContext } from "@rrsh/shared-types";

export interface RunPayrollInput {
  concepts: ConceptDefinition[];
  params: Record<string, number>;
  fixedValuesByCode?: Record<string, number>;
}

export interface RunPayrollOutput {
  results: ConceptResult[];
  sumsByTag: Record<string, number>;
}

export function runPayroll(input: RunPayrollInput): RunPayrollOutput {
  const byId = new Map(input.concepts.map((c) => [c.id, c]));
  const byCode = new Map(input.concepts.map((c) => [c.code, c]));
  const idByCode = new Map(input.concepts.map((c) => [c.code, c.id]));
  const nodes = input.concepts.map((c) => c.id);
  const edges: Array<[number, number]> = [];

  for (const concept of input.concepts) {
    if (!concept.formula) continue;
    const deps = extractDependencies(concept.formula);
    for (const depId of deps.conceptIds) {
      edges.push([depId, concept.id]);
    }
    for (const depCode of deps.conceptCodes) {
      const depId = idByCode.get(depCode);
      if (!depId) throw new Error(`Concepto referenciado inexistente: ${depCode}`);
      edges.push([depId, concept.id]);
    }
  }

  const executionOrder = topologicalSort(nodes, edges);
  const valuesByConceptId: Record<number, number> = {};
  const valuesByConceptCode: Record<string, number> = {};
  const sumsByTag: Record<string, number> = {};
  const results: ConceptResult[] = [];

  for (const conceptId of executionOrder) {
    const concept = byId.get(conceptId)!;
    const fixedValue = input.fixedValuesByCode?.[concept.code];
    const ctx: PayrollContext = {
      valuesByConceptCode,
      valuesByConceptId,
      params: input.params,
      sumsByTag
    };

    const value =
      fixedValue ?? (concept.formula ? evaluateFormula(concept.formula, ctx) : 0);

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
