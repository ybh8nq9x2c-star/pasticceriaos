// =============================================================================
// modules/recipe-import/ai/enrich.ts
// Orchestrazione COVERAGE-FIRST dell'arricchimento AI.
//   baseline (deterministico, copertura piena) = ANCORA → quante/quali ricette.
//   L'AI normalizza in piccoli CHUNK; il merge è PER-INDICE.
// Invariante garantita: final.length === baseline.length, dropped === 0.
//
// Il normalizer è INIETTATO (DI) così l'orchestrazione è testabile senza rete:
// il service passa `aiNormalizeRecipes` (provider); i test passano un fake.
// =============================================================================

import type { ParsedRecipe } from '../types';
import type { AiNormalizeInput, AiNormalizeResult, AiNormalizedRecipe } from './contract';
import { CHUNK_SIZE, CHUNK_CONCURRENCY, chunkArray, mapLimit } from './chunk';
import { enrichByIndex } from './adapter';

export type ChunkNormalizer = (input: AiNormalizeInput) => Promise<AiNormalizeResult | null>;

export interface EnrichDiag {
  baselineCount: number;
  chunkCount: number;
  chunkSizes: number[];
  chunkResults: { ok: boolean; validated: number }[];
  enrichedCount: number; // ricette baseline che hanno ricevuto dati AI
  failedCount: number; // ricette in chunk falliti (→ "da confermare")
  finalCount: number;
  droppedCount: number; // DEVE essere 0
}

interface Indexed {
  index: number;
  recipe: ParsedRecipe;
}

/**
 * Arricchisce il baseline normalizzando le ricette in chunk. Qualsiasi esito del
 * normalizer (subset, null, eccezione, indici fuori range) NON può ridurre la
 * copertura: le ricette non arricchite restano identiche al baseline.
 */
export async function enrichBaselineWithAiChunks(
  baseline: ParsedRecipe[],
  normalize: ChunkNormalizer,
  opts?: { chunkSize?: number; concurrency?: number },
): Promise<{ recipes: ParsedRecipe[]; diag: EnrichDiag }> {
  const baselineCount = baseline.length;
  if (baselineCount === 0) {
    return {
      recipes: baseline,
      diag: { baselineCount: 0, chunkCount: 0, chunkSizes: [], chunkResults: [], enrichedCount: 0, failedCount: 0, finalCount: 0, droppedCount: 0 },
    };
  }

  const indexed: Indexed[] = baseline.map((recipe, index) => ({ index, recipe }));
  const chunks = chunkArray(indexed, opts?.chunkSize ?? CHUNK_SIZE);

  const byIndex = new Map<number, AiNormalizedRecipe>();
  const failed = new Set<number>();

  const chunkResults = await mapLimit(chunks, opts?.concurrency ?? CHUNK_CONCURRENCY, async (chunk) => {
    const valid = new Set(chunk.map((c) => c.index));
    const input: AiNormalizeInput = {
      recipes: chunk.map((c) => ({
        index: c.index,
        name: c.recipe.name,
        rawLines: c.recipe.ingredients.map((l) => l.rawText || l.name).filter(Boolean),
      })),
    };

    let res: AiNormalizeResult | null = null;
    try {
      res = await normalize(input);
    } catch {
      res = null; // il normalizer non dovrebbe lanciare, ma blindiamo comunque
    }

    if (!res) {
      // Chunk fallito: tutte le sue ricette restano baseline + "da confermare".
      for (const c of chunk) failed.add(c.index);
      return { ok: false, validated: 0 };
    }

    let validated = 0;
    for (const ar of res.recipes) {
      // Accetta SOLO indici appartenenti a questo chunk (no spoofing/fuori range),
      // primo vincente in caso di duplicato.
      if (valid.has(ar.index) && !byIndex.has(ar.index)) {
        byIndex.set(ar.index, ar);
        validated++;
      }
    }
    return { ok: true, validated };
  });

  const recipes = enrichByIndex(baseline, byIndex, failed);

  const diag: EnrichDiag = {
    baselineCount,
    chunkCount: chunks.length,
    chunkSizes: chunks.map((c) => c.length),
    chunkResults,
    enrichedCount: byIndex.size,
    failedCount: failed.size,
    finalCount: recipes.length,
    droppedCount: baselineCount - recipes.length, // invariante: 0
  };

  return { recipes, diag };
}
