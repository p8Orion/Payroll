import { PayrollContext } from "@rrsh/shared-types";
export interface FormulaDependencies {
    conceptIds: number[];
    conceptCodes: string[];
    tags: string[];
    params: string[];
}
export declare function extractDependencies(formula: string): FormulaDependencies;
export declare function evaluateFormula(formula: string, ctx: PayrollContext): number;
export declare function topologicalSort(nodes: number[], edges: Array<[number, number]>): number[];
