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
  delete(id: number): Promise<void>;
  replaceAll(concepts: ConceptDefinition[]): Promise<void>;
}

export class InMemoryConceptRepository implements ConceptRepository {
  private concepts = new Map<number, ConceptDefinition>();

  async list(): Promise<ConceptDefinition[]> {
    return [...this.concepts.values()];
  }

  async save(concept: ConceptDefinition): Promise<void> {
    this.concepts.set(concept.id, concept);
  }

  async delete(id: number): Promise<void> {
    this.concepts.delete(id);
  }

  async replaceAll(concepts: ConceptDefinition[]): Promise<void> {
    this.concepts.clear();
    for (const concept of concepts) {
      this.concepts.set(concept.id, concept);
    }
  }
}
