// =============================================================================
// modules/goods-receipts/types.ts
// Read-model e label del goods receipt engine (condivisi UI bakery/supplier).
// =============================================================================

import type {
  ReceiptMode,
  ReceiptStatus,
  ReceiptLineStatus,
  UnitOfMeasure,
} from '@/lib/database.types';

export type { ReceiptMode, ReceiptStatus, ReceiptLineStatus };

/** Derivato (niente colonna dedicata): connesso ⇔ suppliers.supplier_org_id. */
export type SupplierType = 'bakeryos_connected' | 'external_supplier';

export interface ReceiptSupplierRef {
  id: string;
  name: string;
  type: SupplierType;
}

export interface ReceiptListItem {
  id: string;
  mode: ReceiptMode;
  status: ReceiptStatus;
  supplierName: string | null;
  ddtNumber: string | null;
  ddtDate: string | null;
  purchaseOrderId: string | null;
  linesCount: number;
  receivedCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ReceiptLineView {
  id: string;
  productId: string | null;
  productName: string | null;
  rawProductName: string;
  sku: string | null;
  barcode: string | null;
  qtyExpected: number | null;
  qtyReceived: number;
  qtyPosted: number;
  unit: UnitOfMeasure;
  lotNumber: string | null;
  expiryDate: string | null;
  discrepancyReason: string | null;
  lineStatus: ReceiptLineStatus;
  sortOrder: number;
  scannedAt: string | null;
  // ── Tracciabilità GS1 (migration 039) — null sui ricevimenti senza GS1 ──────
  gtin: string | null;
  sscc: string | null;
  caseQuantity: number | null;
  productionDate: string | null;
  gs1Raw: string | null;
  gs1Ai: Record<string, string> | null;
}

export interface ReceiptDetail {
  id: string;
  organizationId: string;
  mode: ReceiptMode;
  status: ReceiptStatus;
  supplier: ReceiptSupplierRef | null;
  purchaseOrderId: string | null;
  sourceDocumentId: string | null;
  ddtNumber: string | null;
  ddtDate: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  lines: ReceiptLineView[];
}

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  draft: 'Bozza',
  expected: 'Atteso',
  partial: 'Parziale',
  completed: 'Completato',
  discrepancy: 'Con discrepanze',
  cancelled: 'Annullato',
};

export const RECEIPT_STATUS_BADGE: Record<
  ReceiptStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  draft: 'neutral',
  expected: 'info',
  partial: 'warning',
  completed: 'success',
  discrepancy: 'danger',
  cancelled: 'neutral',
};

export const LINE_STATUS_LABELS: Record<ReceiptLineStatus, string> = {
  pending: 'Da riconoscere',
  matched: 'Riconosciuto',
  received: 'Ricevuto',
  partial: 'Parziale',
  discrepancy: 'Discrepanza',
};

/**
 * Delta contabilizzabile di una riga: qty ricevuta non ancora registrata a
 * stock. Stessa semantica della RPC (qty_received - qty_posted, mai negativo
 * lato chiamante: il negativo è errore bloccante in RPC). È la garanzia pura
 * di idempotenza: dopo il post, qtyPosted == qtyReceived ⇒ delta 0.
 */
export function linePostableDelta(line: Pick<ReceiptLineView, 'qtyReceived' | 'qtyPosted'>): number {
  return Math.max(0, line.qtyReceived - line.qtyPosted);
}

/**
 * Stato aggregato CALCOLATO delle righe (pure, unit-testato): stessa semantica
 * della RPC complete_purchase_receipt — usato dalla UI per anteprime coerenti.
 */
export function computeReceiptStatus(
  lines: ReadonlyArray<
    Pick<ReceiptLineView, 'lineStatus' | 'discrepancyReason' | 'qtyExpected' | 'qtyReceived'>
  >,
): Extract<ReceiptStatus, 'completed' | 'partial' | 'discrepancy'> {
  let hasDiscrepancy = false;
  let hasPartial = false;
  let hasPending = false;
  for (const l of lines) {
    if (l.lineStatus === 'discrepancy' || l.discrepancyReason) hasDiscrepancy = true;
    else if (l.lineStatus === 'partial') hasPartial = true;
    else if (
      (l.lineStatus === 'pending' || l.lineStatus === 'matched') &&
      (l.qtyExpected ?? 0) > 0 &&
      l.qtyReceived < (l.qtyExpected ?? 0)
    ) {
      hasPending = true;
    }
  }
  if (hasDiscrepancy) return 'discrepancy';
  if (hasPartial || hasPending) return 'partial';
  return 'completed';
}
