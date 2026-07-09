// =============================================================================
// lib/expiry.ts — logica PURA della semantica scadenze (verità, non copy sparsa).
// I lotti già scaduti ancora presenti (qty>0) DEVONO comparire — vanno smaltiti
// — ma NON vanno chiamati "in scadenza": qui si distingue scaduto / oggi / futuro.
// Unit-testabile: niente I/O, niente Date.now() nascosto.
// =============================================================================

/** Fascia di urgenza a partire dai giorni alla scadenza (expiry_date − oggi). */
export type ExpiryBucket = 'expired' | 'today' | 'soon';

export function expiryBucket(daysToExpiry: number): ExpiryBucket {
  if (daysToExpiry < 0) return 'expired';
  if (daysToExpiry === 0) return 'today';
  return 'soon';
}

/**
 * Frase da mestiere per un lotto, coerente su dashboard/notifica/lista:
 *   -5 → "scaduto da 5 giorni"
 *    0 → "scade oggi"
 *   +3 → "scade tra 3 giorni" (+1 → "scade domani")
 */
export function expiryPhrase(daysToExpiry: number): string {
  if (daysToExpiry < 0) {
    const n = Math.abs(daysToExpiry);
    return `scaduto da ${n} giorn${n === 1 ? 'o' : 'i'}`;
  }
  if (daysToExpiry === 0) return 'scade oggi';
  if (daysToExpiry === 1) return 'scade domani';
  return `scade tra ${daysToExpiry} giorni`;
}

/** Partiziona una lista di lotti in "già scaduti" e "in scadenza" (oggi..+N). */
export function partitionByExpiry<T extends { daysToExpiry: number }>(
  batches: T[],
): { expired: T[]; upcoming: T[] } {
  const expired: T[] = [];
  const upcoming: T[] = [];
  for (const b of batches) {
    (b.daysToExpiry < 0 ? expired : upcoming).push(b);
  }
  return { expired, upcoming };
}
