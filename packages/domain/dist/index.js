"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryConceptRepository = void 0;
class InMemoryConceptRepository {
    concepts = new Map();
    async list() {
        return [...this.concepts.values()];
    }
    async save(concept) {
        this.concepts.set(concept.id, concept);
    }
}
exports.InMemoryConceptRepository = InMemoryConceptRepository;
