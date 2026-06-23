// =============================================================================
// modules/recipe-import/ai/chunk.ts
// Utility PURE per il chunking dell'arricchimento AI coverage-first. Nessuna
// rete, nessun DB. Tenere i chunk PICCOLI è ciò che impedisce il troncamento
// dell'output strutturato (la causa del collasso 50→6).
// =============================================================================

/** Ricette per richiesta AI. Piccolo di proposito: niente troncamento JSON. */
export const CHUNK_SIZE = 6;

/** Chunk concorrenti max: limita latenza senza martellare l'API (rate limit). */
export const CHUNK_CONCURRENCY = 4;

/** Spezza un array in blocchi di al più `size` elementi (size ≥ 1). */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/**
 * Esegue `fn` su ogni elemento con al più `limit` esecuzioni concorrenti,
 * preservando l'ordine dei risultati. Worker-pool minimale (niente dipendenze).
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
