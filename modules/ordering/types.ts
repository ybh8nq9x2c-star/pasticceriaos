// =============================================================================
// modules/ordering/types.ts
// Tipi dominio: ordini d'acquisto.
// =============================================================================

import type { UnitOfMeasure, DispatchOutcome } from '@/lib/database.types';

export type OrderStatus = 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';
export type { DispatchOutcome };

export interface OrderLineItem {
  id: string;
  orderId: string;
  ingredientProductId: string;
  ingredientName: string;          // snapshot al momento dell'ordine
  quantity: number;
  unitSnapshot: UnitOfMeasure;     // snapshot
  unitPriceSnapshot: number | null; // snapshot
  lineTotal: number | null;        // computed: quantity * unitPriceSnapshot
}

export interface PurchaseOrder {
  id: string;
  organizationId: string;
  supplierId: string;
  supplierName: string;  // join
  supplierEmail: string; // join
  status: OrderStatus;
  orderDate: string;
  expectedDate: string | null;
  notes: string | null;
  emailMessageId: string | null;
  /** Esito invio: 'delivered' = recapito attestato; altrimenti da inviare a mano. */
  dispatchOutcome: DispatchOutcome | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: OrderLineItem[];
  totalAmount: number | null; // computed
}

export interface PurchaseOrderListItem {
  id: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  orderDate: string;
  expectedDate: string | null;
  lineItemsCount: number;
  totalAmount: number | null;
  sentAt: string | null;
  dispatchOutcome: DispatchOutcome | null;
  createdAt: string;
}

export interface OrderStatusEvent {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  notes: string | null;
  changedBy: string | null;
  createdAt: string;
}
