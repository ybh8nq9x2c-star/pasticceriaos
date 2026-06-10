// =============================================================================
// modules/marketplace/types.ts
// Domain types + order lifecycle model for the cross-org marketplace.
// The transition matrix here MIRRORS the DB guard (014_marketplace_orders.sql)
// so the service can reject invalid moves with typed errors before hitting SQL.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

export type AccountType = 'customer' | 'supplier';
export type ConnectionStatus = 'active' | 'revoked';

export type MarketplaceOrderStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'in_preparation'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

// from -> { to: side allowed to perform it }
export const ORDER_TRANSITIONS: Record<
  MarketplaceOrderStatus,
  Partial<Record<MarketplaceOrderStatus, AccountType>>
> = {
  draft:          { submitted: 'customer', cancelled: 'customer' },
  submitted:      { accepted: 'supplier', cancelled: 'supplier' /* customer may also cancel, see canTransition */ },
  accepted:       { in_preparation: 'supplier', cancelled: 'supplier' },
  in_preparation: { shipped: 'supplier', cancelled: 'supplier' },
  shipped:        { delivered: 'supplier' },
  delivered:      {},
  cancelled:      {},
};

/** The account type permitted to perform a transition, or null if invalid. */
export function actorForTransition(
  from: MarketplaceOrderStatus,
  to: MarketplaceOrderStatus,
): AccountType | null {
  // customer may also cancel a 'submitted' order
  if (from === 'submitted' && to === 'cancelled') return 'customer';
  return ORDER_TRANSITIONS[from]?.[to] ?? null;
}

export function canTransition(
  from: MarketplaceOrderStatus,
  to: MarketplaceOrderStatus,
  actor: AccountType,
): boolean {
  if (from === 'submitted' && to === 'cancelled') return actor === 'customer' || actor === 'supplier';
  return actorForTransition(from, to) === actor;
}

export const ORDER_STATUS_LABELS: Record<MarketplaceOrderStatus, string> = {
  draft: 'Bozza',
  submitted: 'Inviato',
  accepted: 'Accettato',
  in_preparation: 'In preparazione',
  shipped: 'Spedito',
  delivered: 'Consegnato',
  cancelled: 'Annullato',
};

// ── Read-model shapes returned by the service ────────────────────────────────

export interface ConnectionKeyView {
  id: string;
  label: string | null;
  keyPrefix: string;       // public, e.g. "PSOS-K7Q4"
  isActive: boolean;
  createdAt: string;
  revokedAt: string | null;
}

export interface ConnectedSupplier {
  connectionId: string;
  supplierOrgId: string;
  supplierName: string;
  status: ConnectionStatus;
  connectedAt: string;
}

export interface ConnectedCustomer {
  connectionId: string;
  customerOrgId: string;
  customerName: string;
  status: ConnectionStatus;
  connectedAt: string;
}

export interface CatalogItem {
  id: string;
  supplierOrgId: string;
  name: string;
  sku: string | null;
  unit: UnitOfMeasure;
  unitPrice: number | null;
  isActive: boolean;
}

export interface MarketplaceOrderLine {
  id: string;
  catalogItemId: string | null;
  name: string;
  sku: string | null;
  unit: UnitOfMeasure;
  quantity: number;
  unitPrice: number | null;
  sortOrder: number;
}

export interface MarketplaceOrderSummary {
  id: string;
  customerOrgId: string;
  supplierOrgId: string;
  counterpartyName: string;     // supplier name for customer view, customer name for supplier view
  status: MarketplaceOrderStatus;
  total: number;
  lineCount: number;
  createdAt: string;
  submittedAt: string | null;
}

export interface OrderStatusEvent {
  id: string;
  fromStatus: MarketplaceOrderStatus | null;
  toStatus: MarketplaceOrderStatus;
  note: string | null;
  createdAt: string;
  changedByOrgId: string | null;
}

export interface MarketplaceOrderDetail extends MarketplaceOrderSummary {
  connectionId: string;
  notes: string | null;
  lines: MarketplaceOrderLine[];
  history: OrderStatusEvent[];
}
