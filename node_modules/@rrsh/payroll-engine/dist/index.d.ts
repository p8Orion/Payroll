import { ConceptDefinition, ConceptResult } from "@rrsh/shared-types";
export interface RunPayrollInput {
    concepts: ConceptDefinition[];
    params: Record<string, number>;
    fixedValuesByCode?: Record<string, number>;
}
export interface RunPayrollOutput {
    results: ConceptResult[];
    sumsByTag: Record<string, number>;
}
export declare function runPayroll(input: RunPayrollInput): RunPayrollOutput;
