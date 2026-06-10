// =============================================================================
// modules/customers/types.ts
// Ordini clienti (prenotazioni torte/ritiri) integrati nel piano produzione.
// =============================================================================

import type { CustomerOrderStatus } from '@/lib/database.types';

export interface CustomerOrderItem {
  id: string;
  recipeId: string | null;
  recipeName: string | null;
  description: string;
  quantity: number;
  unitPrice: number | null;
  notes: string | null;
}

export interface CustomerOrder {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  pickupDate: string;
  pickupTime: string | null;
  notes: string | null;
  status: CustomerOrderStatus;
  totalAmount: number | null;
  depositPaid: number | null;
  createdAt: string;
  items: CustomerOrderItem[];
}

export interface CustomerOrderListItem {
  id: string;
  customerName: string;
  pickupDate: string;
  pickupTime: string | null;
  status: CustomerOrderStatus;
  totalAmount: number | null;
  itemsCount: number;
  piecesCount: number;
}

export const CUSTOMER_ORDER_STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  pending:       'Da confermare',
  confirmed:     'Confermato',
  in_production: 'In produzione',
  ready:         'Pronto',
  delivered:     'Consegnato',
  cancelled:     'Annullato',
};

/** Transizioni consentite (state machine semplice e lineare con annullo). */
export const CUSTOMER_ORDER_TRANSITIONS: Record<CustomerOrderStatus, CustomerOrderStatus[]> = {
  pending:       ['confirmed', 'cancelled'],
  confirmed:     ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready:         ['delivered'],
  delivered:     [],
  cancelled:     [],
};
