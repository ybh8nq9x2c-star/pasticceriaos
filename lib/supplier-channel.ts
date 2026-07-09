// =============================================================================
// lib/supplier-channel.ts
// UNICA verità sul "canale" di un fornitore/ordine: connesso su BakeryOS
// (ordine interno condiviso) vs email/manuale. Puro, senza import di dominio,
// così UI e servizi condividono la stessa logica e lo stesso copy.
//
// Regola: un fornitore è "bakeryos" SOLO se ha l'org marketplace collegata
// (supplier_org_id valorizzato) E una connessione ATTIVA. Una connessione
// revocata torna onestamente a "email" finché non viene ricollegata.
// =============================================================================

export type SupplierChannel = 'bakeryos' | 'email';

export interface SupplierChannelInfo {
  channel: SupplierChannel;
  /** connectionId marketplace attivo quando channel === 'bakeryos', altrimenti null. */
  connectionId: string | null;
}

/** Riferimento minimo a una connessione attiva (org fornitore ↔ id connessione). */
export interface ConnectionRef {
  supplierOrgId: string;
  connectionId: string;
}

/** Mappa org-fornitore → connectionId, a partire dalle connessioni attive. */
export function connectionMap(connections: ConnectionRef[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of connections) m.set(c.supplierOrgId, c.connectionId);
  return m;
}

/** Risolve il canale di UN fornitore dato l'insieme delle connessioni attive. */
export function resolveSupplierChannel(
  supplier: { supplierOrgId: string | null },
  connectionByOrg: Map<string, string>,
): SupplierChannelInfo {
  const orgId = supplier.supplierOrgId;
  if (orgId && connectionByOrg.has(orgId)) {
    return { channel: 'bakeryos', connectionId: connectionByOrg.get(orgId) ?? null };
  }
  return { channel: 'email', connectionId: null };
}

/** Arricchisce una lista di fornitori con il canale risolto (puro, generico). */
export function withSupplierChannel<T extends { supplierOrgId: string | null }>(
  suppliers: T[],
  connections: ConnectionRef[],
): (T & SupplierChannelInfo)[] {
  const m = connectionMap(connections);
  return suppliers.map((s) => ({ ...s, ...resolveSupplierChannel(s, m) }));
}

/** Canale di un ORDINE standard: interno se è lo specchio di un ordine marketplace. */
export function orderChannel(marketplaceOrderId: string | null | undefined): SupplierChannel {
  return marketplaceOrderId ? 'bakeryos' : 'email';
}

// ── Copy centralizzato (IT). Sobrio, operativo, nessuna ambiguità. ───────────
export const CHANNEL_COPY: Record<SupplierChannel, {
  /** Etichetta piena per hero/dettaglio. */
  label: string;
  /** Badge compatto per liste. */
  short: string;
  /** Microcopy sotto il nome. */
  sub: string;
}> = {
  bakeryos: {
    label: 'Connesso su BakeryOS',
    short: 'BakeryOS interno',
    sub: 'Ordini condivisi internamente',
  },
  email: {
    label: 'Email / manuale',
    short: 'Email/manuale',
    sub: 'Ordini inviati via email o a mano',
  },
};
