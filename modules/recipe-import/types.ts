// =============================================================================
// modules/recipe-import/types.ts
// Strutture intermedie dell'import massivo ricette. SONO TRANSITORIE: vivono
// nella risposta del server e nello stato del client durante la review, NON sono
// mai persistite (nessuna tabella). Il commit finale riusa catalog.createRecipe.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

/** Suggerimento di associazione a un prodotto del catalogo (da matching.ts). */
export interface MatchSuggestion {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  confidence: number;
}

/** Una riga ingrediente estratta dal parser + esito del match sul catalogo. */
export interface ParsedIngredientLine {
  /** Testo originale della riga (tracciabilità: l'utente vede da dove viene). */
  rawText: string;
  /** Nome ingrediente estratto. */
  name: string;
  /** Quantità (null se il parser non l'ha riconosciuta → da inserire a mano). */
  quantity: number | null;
  /** Unità riconosciuta (null = ambigua/mancante → da confermare). */
  unit: UnitOfMeasure | null;
  /** Prodotto a catalogo auto-associato (confidence ≥ soglia), altrimenti null. */
  matchedProductId: string | null;
  matchedProductName: string | null;
  /** Suggerimenti quando il match automatico non scatta. */
  suggestions: MatchSuggestion[];
}

/** Una ricetta candidata estratta dall'input. */
export interface ParsedRecipe {
  name: string;
  /** Porzioni/resa se chiaramente presenti, altrimenti null (default in UI). */
  basePortions: number | null;
  category: string | null;
  notes: string | null;
  ingredients: ParsedIngredientLine[];
  /** Ambiguità non bloccanti da mostrare in preview. */
  warnings: string[];
}

export type ImportSourceKind = 'text' | 'csv' | 'pdf';

/**
 * Campo a cui una colonna del CSV può essere abbinata nel passo di MAPPING.
 * È un concetto di SOLO PREVIEW: determina come il parser costruisce le
 * ParsedRecipe, ma il commit finale resta validato dagli schemi stretti.
 */
export type ImportColumnField =
  | 'recipe'      // nome ricetta
  | 'portions'    // porzioni / resa
  | 'ingredient'  // nome ingrediente (obbligatorio)
  | 'quantity'    // quantità ingrediente (obbligatorio)
  | 'unit'        // unità
  | 'category'    // categoria
  | 'notes'       // istruzioni / note
  | 'allergens'   // allergeni (confluiscono nelle note)
  | 'ignore';     // colonna ignorata

/** Una colonna vista nel file, con campioni e abbinamento suggerito. */
export interface CsvColumn {
  index: number;
  /** Testo dell'intestazione (vuoto se il file non ha intestazioni). */
  header: string;
  /** Primi valori non vuoti della colonna (anteprima per l'utente). */
  sample: string[];
  /** Abbinamento auto-suggerito (header-synonym + contenuto). */
  suggested: ImportColumnField;
}

/** Esito dell'ispezione di un CSV per decidere se serve il passo di mapping. */
export interface CsvInspection {
  delimiter: string;
  /** Best-effort: la prima riga è un'intestazione? */
  hasHeader: boolean;
  columns: CsvColumn[];
  /** true → l'auto-detect basta (ingrediente + quantità riconosciuti). */
  confident: boolean;
}

/** Mappatura risolta dall'utente, ri-applicata dal parser lato server. */
export interface ResolvedMapping {
  fields: ImportColumnField[];
  hasHeader: boolean;
}

/** Risultato dell'analisi: ciò che la preview mostra e l'utente corregge. */
export interface AnalyzeResult {
  source: ImportSourceKind;
  recipes: ParsedRecipe[];
  /** Avvisi globali (es. "PDF poco leggibile", "nessuna ricetta rilevata"). */
  warnings: string[];
}

/** Esito del commit batch, mostrato all'utente. */
export interface ImportSummary {
  createdRecipes: number;
  createdIngredients: number;
  /** Ricette scartate/fallite con motivo (import parziale). */
  skipped: { name: string; reason: string }[];
}
