export type ConceptClass = "definitivo" | "transitorio";
export interface ConceptDefinition {
    id: number;
    code: string;
    name: string;
    conceptClass: ConceptClass;
    formula?: string;
    tags: string[];
    acceptsNews?: boolean;
}
export interface PayrollContext {
    valuesByConceptCode: Record<string, number>;
    valuesByConceptId: Record<number, number>;
    params: Record<string, number>;
    sumsByTag: Record<string, number>;
}
export interface ConceptResult {
    conceptId: number;
    code: string;
    value: number;
    conceptClass: ConceptClass;
    trace: string[];
}
