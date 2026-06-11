// =============================================================================
// modules/documents/matching.ts
// Helper puri per il matching documento↔ordine (testabili senza server).
// =============================================================================

/**
 * Normalizzazione nome per il matching documento↔ordine quando mancano gli ID
 * (es. righe caricate dal fornitore). Stessa semantica del ponte di ricezione
 * marketplace (`lower(trim(name))` in receive_marketplace_order), con in più
 * il collasso degli spazi multipli.
 */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
