// =============================================================================
// lib/status.ts — HUB CANONICO degli stati operativi (Warm Operational Clarity).
//
// Un solo posto per la mappa STATO → TONO (variant di <Badge>), così "stesso
// stato = stesso colore" ovunque. NON contiene logica di dominio: solo la
// corrispondenza colore. Le label di dominio restano nei moduli (es.
// RECEIPT_STATUS_LABELS in modules/goods-receipts/types).
//
// PALETTE TONALE (significato fisso, non negoziabile):
//   neutral  → bozza / disattivato / annullato            (calmo, non allarma)
//   info     → letto / riconosciuto (GS1, match prodotto) (il sistema ha capito)
//   warning  → ricevuto NON contabilizzato / parziale / scorta da tenere d'occhio
//   success  → contabilizzato / completato / ok           (definitivo, positivo)
//   danger   → discrepanza / critico / esaurito / sotto zero (anomalia)
// =============================================================================

import type { BadgeVariant } from '@/components/ui/Badge';
import type { ReceiptLineStatus } from '@/lib/database.types';
import type { StockStatus } from '@/modules/reporting/types';

// Re-export degli stati di ricevimento (già canonici in goods-receipts/types):
// importarli da qui o da lì è equivalente, ma qui è l'hub documentato.
export {
  RECEIPT_STATUS_LABELS,
  RECEIPT_STATUS_BADGE,
  LINE_STATUS_LABELS,
} from '@/modules/goods-receipts/types';

/** Riga ricevimento → tono. Unica fonte (prima duplicata in ReceiptLinesPanel). */
export const RECEIPT_LINE_BADGE: Record<ReceiptLineStatus, BadgeVariant> = {
  pending:     'warning', // "Da riconoscere": serve un'azione
  matched:     'info',    // "Riconosciuto"
  received:    'success', // "Ricevuto"
  partial:     'warning',
  discrepancy: 'danger',
};

/**
 * Stato scorta → tono. Riferimento canonico per /inventory.
 * NB: `low` è elevato a `warning` (basso = da tenere d'occhio), non `primary`:
 * il verde-brand su una scorta bassa si confonde con "ok". Da adottare quando
 * si instrada il badge magazzino (oggi /inventory usa ancora STATUS_CFG locale).
 */
export const STOCK_STATUS_BADGE: Record<StockStatus, BadgeVariant> = {
  out_of_stock: 'danger',
  critical:     'warning',
  low:          'warning',
  ok:           'success',
};
