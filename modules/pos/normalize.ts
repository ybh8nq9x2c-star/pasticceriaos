// =============================================================================
// modules/pos/normalize.ts — UNICA definizione della normalizzazione dei
// riferimenti prodotto POS (P0-H: prima era copiata identica in ingest,
// service e repository — tre punti da tenere allineati a mano).
// Contratto: trim + lowercase. product_mappings.external_product_ref è
// SEMPRE salvato normalizzato; ogni lookup normalizza allo stesso modo.
// =============================================================================

export function normalizePosRef(ref: string): string {
  return ref.trim().toLowerCase();
}
