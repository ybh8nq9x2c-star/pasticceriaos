// =============================================================================
// modules/ordering/status-display.ts
// Mapping PURO stato ordine → badge (label + variante) e pipeline visiva.
// Nessun import server: condivisibile fra Server/Client Component e testabile.
//
// ONESTÀ INVIO: un ordine 'sent' mostra "Inviato" SOLO se il recapito automatico
// è attestato (dispatch_outcome = 'delivered'). Negli altri casi (nessun canale
// configurato o invio fallito) mostra "Da inviare a mano" → l'utente capisce che
// deve mandarlo lui. Mai una finzione di consegna.
//
// HAPPY PATH VISIVO: Bozza → Inviato → Ricevuto. 'confirmed' resta uno stato DB
// valido (ordini legacy) ma NON è un nodo della pipeline: lo si mappa sul passo
// "Inviato" (è comunque "in attesa di consegna").
// =============================================================================

import type { OrderStatus, DispatchOutcome } from './types';

export type BadgeVariant = 'gray' | 'blue' | 'indigo' | 'green' | 'red' | 'amber';

export interface OrderBadge {
  label: string;
  variant: BadgeVariant;
}

/** Badge onesto per lo stato ordine. */
export function orderStatusBadge(
  status: OrderStatus,
  dispatchOutcome: DispatchOutcome | null,
): OrderBadge {
  switch (status) {
    case 'draft':
      return { label: 'Bozza', variant: 'gray' };
    case 'sent':
      return dispatchOutcome === 'delivered'
        ? { label: 'Inviato', variant: 'blue' }
        : { label: 'Da inviare a mano', variant: 'amber' };
    case 'confirmed':
      return { label: 'Confermato', variant: 'indigo' };
    case 'received':
      return { label: 'Ricevuto', variant: 'green' };
    case 'cancelled':
      return { label: 'Annullato', variant: 'red' };
    default:
      // Stato non previsto dalla UI (es. 'partial', non supportato end-to-end):
      // nessun crash, badge neutro. Vedi reality-check Sprint 2.
      return { label: 'Stato sconosciuto', variant: 'gray' };
  }
}

/** True se l'ordine è 'sent' ma il recapito automatico NON è attestato. */
export function needsManualSend(
  status: OrderStatus,
  dispatchOutcome: DispatchOutcome | null,
): boolean {
  return status === 'sent' && dispatchOutcome !== 'delivered';
}

// ── Pipeline visiva semplificata (3 nodi) ───────────────────────────────────
export const ORDER_PIPELINE: OrderStatus[] = ['draft', 'sent', 'received'];

/**
 * Indice di avanzamento nella pipeline a 3 nodi.
 * 'confirmed' coincide con 'sent' (passo "Inviato"); 'cancelled' = -1.
 */
export function pipelineIndex(status: OrderStatus): number {
  switch (status) {
    case 'draft':
      return 0;
    case 'sent':
    case 'confirmed':
      return 1;
    case 'received':
      return 2;
    case 'cancelled':
      return -1;
    default:
      return -1; // stato inatteso → fuori pipeline, nessun crash
  }
}
