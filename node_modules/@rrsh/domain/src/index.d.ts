import { ConceptDefinition } from "@rrsh/shared-types";
export interface Legajo {
    id: string;
    nombre: string;
    frenteAdministrativo: string;
    categoria: string;
}
export interface ConceptRepository {
    list(): Promise<ConceptDefinition[]>;
    save(concept: ConceptDefinition): Promise<void>;
}
export declare class InMemoryConceptRepository implements ConceptRepository {
    private concepts;
    list(): Promise<ConceptDefinition[]>;
    save(concept: ConceptDefinition): Promise<void>;
}
