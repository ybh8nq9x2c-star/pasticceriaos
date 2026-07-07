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
import type { CustomerOrderStatus, ReceiptLineStatus } from '@/lib/database.types';
import type { StockStatus } from '@/modules/reporting/types';
import type { MarketplaceOrderStatus } from '@/modules/marketplace/types';

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
 * Stato scorta → tono canonico per /inventory. Allineato ai toni attuali del
 * magazzino (nessun cambio cromatico): `critical` normalizzato dal raw amber al
 * token `warning`, `low` resta `primary` come oggi.
 */
export const STOCK_STATUS_BADGE: Record<StockStatus, BadgeVariant> = {
  out_of_stock: 'danger',
  critical:     'warning',
  low:          'primary',
  ok:           'success',
};

/**
 * Ordine marketplace → tono canonico (liste cliente/fornitore + dettaglio).
 * Applica la palette dell'hub: `submitted` è warning perché per il fornitore
 * "serve un'azione" (confermare); `cancelled` è neutral, NON danger — un
 * annullamento è un esito normale, il rosso resta riservato alle anomalie.
 * `accepted`/`shipped` condividono famiglie tonali distinte dal warning:
 * pipeline in corso, nessuna urgenza.
 */
export const MARKETPLACE_ORDER_BADGE: Record<MarketplaceOrderStatus, BadgeVariant> = {
  draft:          'neutral',
  submitted:      'warning',
  accepted:       'info',
  in_preparation: 'primary',
  shipped:        'primary',
  delivered:      'success',
  cancelled:      'neutral',
};

/**
 * Ordine cliente (prenotazione) → tono canonico. `ready` è il momento
 * operativo (il cliente può ritirare) → success; `cancelled` neutral come da
 * palette (il rosso resta alle anomalie).
 */
export const CUSTOMER_ORDER_BADGE: Record<CustomerOrderStatus, BadgeVariant> = {
  pending:       'info',
  confirmed:     'primary',
  in_production: 'warning',
  ready:         'success',
  delivered:     'neutral',
  cancelled:     'neutral',
};
