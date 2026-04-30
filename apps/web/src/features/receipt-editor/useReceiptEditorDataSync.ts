import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { ComposicionSalarialModel } from "../composiciones/ComposicionesSalarialesPage";
import { HistoricalLiquidacionRecord } from "../informacion/F1359InfoPage";
import { LegajoModel } from "../legajos/LegajosPage";
import { initialConcepts } from "../../model/seed";
import { ConceptModel, F1359FieldModel, ReceiptModel } from "../../model/types";
import {
  ApiConcept,
  ApiF1359Field,
  ApiReceipt,
  apiBaseUrl,
  defaultConvenios,
  ensureReceiptMatrix,
  fromApiConcept,
  legacyReceiptsStorageKey,
  parseApiReceipt,
  persistConcept,
  receiptF1359FilterStorageKey,
  receiptTagFilterStorageKey
} from "./receiptEditorUtils";

interface UseReceiptEditorDataSyncParams {
  concepts: ConceptModel[];
  setConcepts: Dispatch<SetStateAction<ConceptModel[]>>;
  conceptsLoaded: boolean;
  setConceptsLoaded: Dispatch<SetStateAction<boolean>>;
  receipts: ReceiptModel[];
  setReceipts: Dispatch<SetStateAction<ReceiptModel[]>>;
  receiptsLoaded: boolean;
  setReceiptsLoaded: Dispatch<SetStateAction<boolean>>;
  convenios: string[];
  defaultReceiptOrder: number[];
  setConvenioOptions: Dispatch<SetStateAction<string[]>>;
  legajos: LegajoModel[];
  setLegajos: Dispatch<SetStateAction<LegajoModel[]>>;
  legajosLoaded: boolean;
  setLegajosLoaded: Dispatch<SetStateAction<boolean>>;
  composiciones: ComposicionSalarialModel[];
  setComposiciones: Dispatch<SetStateAction<ComposicionSalarialModel[]>>;
  setF1359Fields: Dispatch<SetStateAction<F1359FieldModel[]>>;
  receiptF1359Filter: string;
  receiptTagFilter: string;
  setLiquidacionesHistory: Dispatch<SetStateAction<HistoricalLiquidacionRecord[]>>;
}

export function useReceiptEditorDataSync({
  concepts,
  setConcepts,
  conceptsLoaded,
  setConceptsLoaded,
  receipts,
  setReceipts,
  receiptsLoaded,
  setReceiptsLoaded,
  convenios,
  defaultReceiptOrder,
  setConvenioOptions,
  legajos,
  setLegajos,
  legajosLoaded,
  setLegajosLoaded,
  composiciones,
  setComposiciones,
  setF1359Fields,
  receiptF1359Filter,
  receiptTagFilter,
  setLiquidacionesHistory
}: UseReceiptEditorDataSyncParams) {
  const [composicionesLoaded, setComposicionesLoaded] = useState(false);
  useEffect(() => {
    const loadConcepts = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/concepts`);
        if (!response.ok) {
          setConceptsLoaded(true);
          return;
        }
        const apiConcepts = (await response.json()) as ApiConcept[];
        if (apiConcepts.length > 0) {
          const conceptCodeById = Object.fromEntries(
            apiConcepts.map((item) => [item.id, item.code])
          ) as Record<number, string>;
          const hydrated = apiConcepts.map((item) => fromApiConcept(item, conceptCodeById));
          setConcepts(hydrated);
        }
      } catch {
        // Keep local seed if API unavailable.
      } finally {
        setConceptsLoaded(true);
      }
    };
    void loadConcepts();
  }, [setConcepts, setConceptsLoaded]);

  useEffect(() => {
    if (!composiciones.length || !legajos.length) return;
    let changed = false;
    const normalize = (value: string | undefined): string => (value ?? "").trim().toLowerCase();
    const migrated = legajos.map((legajo) => {
      const selected = (legajo.composicionSalarial ?? "").trim();
      if (!selected) return legajo;
      const byId = composiciones.find(
        (c) =>
          c.id === selected &&
          normalize(c.convenio) === normalize(legajo.convenio)
      );
      if (byId) return legajo;
      const byCode = composiciones.find(
        (c) =>
          normalize(c.code) === normalize(selected) &&
          normalize(c.convenio) === normalize(legajo.convenio)
      );
      if (!byCode) return legajo;
      changed = true;
      return { ...legajo, composicionSalarial: byCode.id };
    });
    if (changed) {
      setLegajos(migrated);
    }
  }, [composiciones, legajos, setLegajos]);

  useEffect(() => {
    const loadLegajos = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/legajos`);
        if (!response.ok) {
          setLegajosLoaded(true);
          return;
        }
        const apiLegajos = (await response.json()) as LegajoModel[];
        setLegajos(
          (apiLegajos ?? []).map((item) => ({
            ...item,
            convenio: item.convenio ?? "",
            composicionSalarial: item.composicionSalarial ?? "",
            valoresFijos: Array.isArray(item.valoresFijos) ? item.valoresFijos : []
          })).map((item) => ({
            ...item,
            valoresFijos: item.valoresFijos.map((vf) => ({
              id: vf.id,
              clave: (vf as { clave?: string; concepto?: string }).clave ??
                (vf as { clave?: string; concepto?: string }).concepto ??
                "",
              valor: vf.valor
            }))
          }))
        );
      } catch {
        // Keep in-memory local state if API unavailable.
      } finally {
        setLegajosLoaded(true);
      }
    };
    void loadLegajos();
  }, [setLegajos, setLegajosLoaded]);

  useEffect(() => {
    const loadComposiciones = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/composiciones-salariales`);
        if (!response.ok) return;
        const parsed = (await response.json()) as ComposicionSalarialModel[];
        setComposiciones(
          (parsed ?? []).map((item) => ({
            ...item,
            convenio: item.convenio ?? "",
            valoresFijos: Array.isArray(item.valoresFijos)
              ? item.valoresFijos.map((vf) => ({
                  id: vf.id,
                  clave: (vf as { clave?: string; concepto?: string }).clave ??
                    (vf as { clave?: string; concepto?: string }).concepto ??
                    "",
                  valor: vf.valor
                }))
              : []
          }))
        );
        // Enable persistence only after a successful fetch+hydrate.
        setComposicionesLoaded(true);
      } catch {
        // noop
      }
    };
    void loadComposiciones();
  }, [setComposiciones]);

  useEffect(() => {
    const loadConvenios = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/convenios`);
        if (!response.ok) return;
        const parsed = (await response.json()) as string[];
        if (Array.isArray(parsed) && parsed.length) setConvenioOptions(parsed);
      } catch {
        // Keep defaults
      }
    };
    void loadConvenios();
  }, [setConvenioOptions]);

  useEffect(() => {
    const loadF1359Fields = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/f1359-fields`);
        if (!response.ok) return;
        const parsed = (await response.json()) as ApiF1359Field[];
        setF1359Fields(Array.isArray(parsed) ? parsed : []);
      } catch {
        // noop
      }
    };
    void loadF1359Fields();
  }, [setF1359Fields]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(receiptF1359FilterStorageKey, receiptF1359Filter);
  }, [receiptF1359Filter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(receiptTagFilterStorageKey, receiptTagFilter);
  }, [receiptTagFilter]);

  useEffect(() => {
    const loadReceipts = async () => {
      const fallbackOrder = initialConcepts
        .filter((concept) => concept.conceptClass === "definitivo")
        .map((concept) => concept.id);
      try {
        const response = await fetch(`${apiBaseUrl}/receipts`);
        if (!response.ok) {
          setReceiptsLoaded(true);
          return;
        }
        const parsed = (await response.json()) as ApiReceipt[];
        const normalizedFromApi = (Array.isArray(parsed) ? parsed : [])
          .map((item) => parseApiReceipt(item, fallbackOrder))
          .filter((item): item is ReceiptModel => Boolean(item));

        if (normalizedFromApi.length > 0) {
          setReceipts(ensureReceiptMatrix(normalizedFromApi, defaultConvenios, fallbackOrder));
          return;
        }

        if (typeof window !== "undefined") {
          const rawLegacy = window.localStorage.getItem(legacyReceiptsStorageKey);
          if (rawLegacy) {
            const legacyParsed = JSON.parse(rawLegacy) as ReceiptModel[];
            const normalizedLegacy = ensureReceiptMatrix(
              Array.isArray(legacyParsed) ? legacyParsed : [],
              defaultConvenios,
              fallbackOrder
            );
            if (normalizedLegacy.length > 0) {
              setReceipts(normalizedLegacy);
            }
          }
        }
      } catch {
        // Keep in-memory fallback state if API unavailable.
      } finally {
        setReceiptsLoaded(true);
      }
    };
    void loadReceipts();
  }, [setReceipts, setReceiptsLoaded]);

  useEffect(() => {
    const loadLiquidaciones = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/liquidaciones`);
        if (!response.ok) return;
        const parsed = (await response.json()) as HistoricalLiquidacionRecord[];
        setLiquidacionesHistory(Array.isArray(parsed) ? parsed : []);
      } catch {
        // noop
      }
    };
    void loadLiquidaciones();
  }, [setLiquidacionesHistory]);

  useEffect(() => {
    if (!conceptsLoaded) return;
    const timeout = setTimeout(() => {
      void Promise.allSettled(concepts.map((concept) => persistConcept(concept)));
    }, 250);
    return () => clearTimeout(timeout);
  }, [concepts, conceptsLoaded]);

  useEffect(() => {
    if (!receiptsLoaded) return;
    const timeout = setTimeout(() => {
      const payload: ApiReceipt[] = receipts.map((receipt) => ({
        id: receipt.id,
        convenio: receipt.convenio,
        liquidationType: receipt.liquidationType,
        definitiveOrder: receipt.definitiveOrder,
        transitoryOrder: receipt.transitoryOrder
      }));
      void fetch(`${apiBaseUrl}/receipts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [receipts, receiptsLoaded]);

  useEffect(() => {
    setReceipts((prev) => {
      const normalized = ensureReceiptMatrix(prev, convenios, defaultReceiptOrder);
      if (
        normalized.length === prev.length &&
        normalized.every(
          (receipt, index) =>
            receipt.id === prev[index].id &&
            receipt.convenio === prev[index].convenio &&
            receipt.liquidationType === prev[index].liquidationType &&
            JSON.stringify(receipt.definitiveOrder) === JSON.stringify(prev[index].definitiveOrder) &&
            JSON.stringify(receipt.transitoryOrder) === JSON.stringify(prev[index].transitoryOrder)
        )
      ) {
        return prev;
      }
      return normalized;
    });
  }, [convenios, defaultReceiptOrder, setReceipts]);

  useEffect(() => {
    if (!legajosLoaded) return;
    const timeout = setTimeout(() => {
      void fetch(`${apiBaseUrl}/legajos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legajos)
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [legajos, legajosLoaded]);

  useEffect(() => {
    if (!composicionesLoaded) return;
    const timeout = setTimeout(() => {
      void fetch(`${apiBaseUrl}/composiciones-salariales`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(composiciones)
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [composiciones, composicionesLoaded]);
}
