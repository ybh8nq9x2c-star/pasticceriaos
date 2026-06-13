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
