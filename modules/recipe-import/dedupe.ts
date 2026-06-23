// =============================================================================
// modules/recipe-import/dedupe.ts
// Idempotenza import (audit R6): un re-upload dello stesso file, o ricette
// rinominate solo per maiuscole/spazi/accenti, NON devono creare doppioni
// silenziosi. Confronto per CHIAVE NORMALIZZATA (diacritici + maiuscole + spazi),
// più stringente del vincolo DB UNIQUE(org, name) che è esatto. PURO e testabile.
// =============================================================================

/** Chiave di confronto ricetta: senza accenti, minuscola, spazi normalizzati. */
export function recipeKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // toglie i diacritici combinanti
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Partiziona il batch in ricette DA CREARE e DOPPIONI. Un nome è doppione se la
 * sua chiave normalizzata coincide con una ricetta ESISTENTE o con un'altra già
 * vista in QUESTO batch (prima occorrenza vince). Idempotente: ripetere lo stesso
 * import non crea nulla di nuovo.
 */
export function partitionByDuplicateName<T extends { name: string }>(
  recipes: T[],
  existingNames: Iterable<string>,
): { toCreate: T[]; duplicates: T[] } {
  const seen = new Set<string>();
  for (const n of existingNames) {
    const k = recipeKey(n);
    if (k) seen.add(k);
  }

  const toCreate: T[] = [];
  const duplicates: T[] = [];
  for (const r of recipes) {
    const k = recipeKey(r.name);
    if (k && seen.has(k)) {
      duplicates.push(r);
    } else {
      if (k) seen.add(k);
      toCreate.push(r);
    }
  }
  return { toCreate, duplicates };
}
