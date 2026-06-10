// =============================================================================
// modules/marketplace/service.ts
// Marketplace domain logic. Every function authorizes server-side via the
// workspace guards, validates with Zod, and relies on RLS as the DB boundary.
// =============================================================================

import 'server-only';
import { AppError, BusinessRuleError, NotFoundError } from '@/lib/errors';
import { requireCustomerSession, requireSupplierSession, getAccountType } from '@/modules/identity/workspace';
import { requireSession } from '@/modules/identity/service';
import {
  createMarketplaceClient,
  generateConnectionKey as genKey,
  hashConnectionKey,
} from './db';
import {
  generateKeySchema, connectSupplierSchema, revokeKeySchema, revokeConnectionSchema,
  catalogItemSchema, createOrderSchema, changeStatusSchema,
} from './schemas';
import { canTransition } from './types';
import type {
  ConnectionKeyView, ConnectedSupplier, ConnectedCustomer, CatalogItem,
  MarketplaceOrderSummary, MarketplaceOrderDetail, MarketplaceOrderStatus, AccountType,
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Db = SupabaseClient<Database>;

// ── audit helper ─────────────────────────────────────────────────────────────
async function audit(
  db: Db, orgId: string, action: string, entityType: string,
  entityId: string | null, metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.from('audit_logs').insert({
    org_id: orgId, actor_user_id: null, action, entity_type: entityType,
    entity_id: entityId, metadata,
  } as never);
}

function mapPgError(code: string | undefined, fallback: string): never {
  const map: Record<string, string> = {
    P0300: 'Solo un account cliente può collegare un fornitore.',
    P0301: 'Organizzazione non trovata.',
    P0302: 'Chiave fornitore non valida o revocata.',
    P0303: 'Non puoi collegarti alla tua stessa organizzazione.',
    P0200: 'Transizione ordine non consentita.',
    P0201: 'Non sei autorizzato a eseguire questa transizione.',
    P0202: 'Non sei il cliente di questo ordine.',
    P0203: 'Non sei il fornitore di questo ordine.',
  };
  throw new BusinessRuleError(code && map[code] ? map[code] : fallback);
}

// =============================================================================
// SUPPLIER · connection keys
// =============================================================================

export async function generateSupplierKey(raw: unknown): Promise<{ plaintext: string; prefix: string }> {
  const { orgId } = await requireSupplierSession();
  const input = generateKeySchema.parse(raw);
  const db = await createMarketplaceClient();

  const key = genKey();
  const { data, error } = await db
    .from('supplier_connection_keys')
    .insert({
      supplier_org_id: orgId,
      label: input.label || null,
      key_prefix: key.prefix,
      key_hash: key.hash,
      created_by: null,
    } as never)
    .select('id')
    .single();
  if (error) throw new AppError(error.message);

  await audit(db, orgId, 'connection_key.created', 'connection_key', (data as { id: string }).id, { prefix: key.prefix });
  // plaintext is returned ONCE; never persisted.
  return { plaintext: key.plaintext, prefix: key.prefix };
}

export async function listSupplierKeys(): Promise<ConnectionKeyView[]> {
  await requireSupplierSession();
  const db = await createMarketplaceClient();
  const { data, error } = await db
    .from('supplier_connection_keys')
    .select('id, label, key_prefix, is_active, created_at, revoked_at')
    .order('created_at', { ascending: false });
  if (error) throw new AppError(error.message);
  return (data ?? []).map((k) => ({
    id: k.id, label: k.label, keyPrefix: k.key_prefix,
    isActive: k.is_active, createdAt: k.created_at, revokedAt: k.revoked_at,
  }));
}

export async function revokeSupplierKey(raw: unknown): Promise<void> {
  const { orgId } = await requireSupplierSession();
  const { keyId } = revokeKeySchema.parse(raw);
  const db = await createMarketplaceClient();
  const { error } = await db
    .from('supplier_connection_keys')
    .update({ is_active: false, revoked_at: new Date().toISOString() } as never)
    .eq('id', keyId);
  if (error) throw new AppError(error.message);
  await audit(db, orgId, 'connection_key.revoked', 'connection_key', keyId);
}

// =============================================================================
// CUSTOMER · connect supplier by key
// =============================================================================

export async function connectSupplier(raw: unknown): Promise<string> {
  await requireCustomerSession();
  const { key } = connectSupplierSchema.parse(raw);
  const db = await createMarketplaceClient();

  const { data, error } = await db.rpc('connect_supplier_by_key_hash', {
    p_key_hash: hashConnectionKey(key),
  });
  if (error) mapPgError(error.code, error.message);
  return data as string;
}

export async function listConnectedSuppliers(): Promise<ConnectedSupplier[]> {
  await requireCustomerSession();
  const db = await createMarketplaceClient();
  const { data, error } = await db
    .from('supplier_customer_connections')
    .select('id, supplier_org_id, status, created_at, supplier:organizations!supplier_customer_connections_supplier_org_id_fkey(name)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .returns<{ id: string; supplier_org_id: string; status: 'active' | 'revoked'; created_at: string; supplier: { name: string } | null }[]>();
  if (error) throw new AppError(error.message);
  return (data ?? []).map((c) => ({
    connectionId: c.id, supplierOrgId: c.supplier_org_id,
    supplierName: c.supplier?.name ?? '—', status: c.status, connectedAt: c.created_at,
  }));
}

export async function listConnectedCustomers(): Promise<ConnectedCustomer[]> {
  await requireSupplierSession();
  const db = await createMarketplaceClient();
  const { data, error } = await db
    .from('supplier_customer_connections')
    .select('id, customer_org_id, status, created_at, customer:organizations!supplier_customer_connections_customer_org_id_fkey(name)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .returns<{ id: string; customer_org_id: string; status: 'active' | 'revoked'; created_at: string; customer: { name: string } | null }[]>();
  if (error) throw new AppError(error.message);
  return (data ?? []).map((c) => ({
    connectionId: c.id, customerOrgId: c.customer_org_id,
    customerName: c.customer?.name ?? '—', status: c.status, connectedAt: c.created_at,
  }));
}

export async function revokeConnection(raw: unknown): Promise<void> {
  const session = await requireSession();        // any authed org member
  const { connectionId } = revokeConnectionSchema.parse(raw);
  const db = await createMarketplaceClient();
  // RLS already restricts UPDATE to a party of the connection.
  const { error } = await db
    .from('supplier_customer_connections')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() } as never)
    .eq('id', connectionId);
  if (error) throw new AppError(error.message);
  await audit(db, session.organizationId, 'connection.revoked', 'connection', connectionId);
}

// =============================================================================
// SUPPLIER · catalog  /  CUSTOMER · read connected catalog
// =============================================================================

export async function listOwnCatalog(): Promise<CatalogItem[]> {
  const { orgId } = await requireSupplierSession();
  const db = await createMarketplaceClient();
  const { data, error } = await db
    .from('supplier_catalog_items')
    .select('id, supplier_org_id, name, sku, unit, unit_price, is_active')
    .eq('supplier_org_id', orgId)
    .order('name');
  if (error) throw new AppError(error.message);
  return (data ?? []).map(toCatalogItem);
}

export async function upsertCatalogItem(raw: unknown, id?: string): Promise<void> {
  const { orgId } = await requireSupplierSession();
  const input = catalogItemSchema.parse(raw);
  const db = await createMarketplaceClient();
  const payload = {
    supplier_org_id: orgId, name: input.name, sku: input.sku || null,
    unit: input.unit, unit_price: input.unitPrice,
  };
  if (id) {
    const { error } = await db.from('supplier_catalog_items').update(payload as never).eq('id', id);
    if (error) throw new AppError(error.message);
  } else {
    const { error } = await db.from('supplier_catalog_items').insert(payload as never);
    if (error) throw new AppError(error.message);
  }
}

export async function deactivateCatalogItem(id: string): Promise<void> {
  await requireSupplierSession();
  const db = await createMarketplaceClient();
  const { error } = await db.from('supplier_catalog_items').update({ is_active: false } as never).eq('id', id);
  if (error) throw new AppError(error.message);
}

/** Customer reads a connected supplier's active catalog (RLS permits via connection). */
export async function listCatalogForConnection(connectionId: string): Promise<CatalogItem[]> {
  await requireCustomerSession();
  const db = await createMarketplaceClient();
  const conn = await loadMyConnection(db, connectionId);
  const { data, error } = await db
    .from('supplier_catalog_items')
    .select('id, supplier_org_id, name, sku, unit, unit_price, is_active')
    .eq('supplier_org_id', conn.supplier_org_id)
    .eq('is_active', true)
    .order('name');
  if (error) throw new AppError(error.message);
  return (data ?? []).map(toCatalogItem);
}

// =============================================================================
// ORDERS · canonical cross-org
// =============================================================================

export async function createOrder(raw: unknown): Promise<string> {
  const { orgId } = await requireCustomerSession();
  const input = createOrderSchema.parse(raw);
  const db = await createMarketplaceClient();

  const conn = await loadMyConnection(db, input.connectionId);

  // idempotency: same key -> return the existing order.
  if (input.idempotencyKey) {
    const { data: existing } = await db
      .from('marketplace_orders').select('id')
      .eq('customer_org_id', orgId).eq('idempotency_key', input.idempotencyKey).maybeSingle();
    if (existing) return (existing as { id: string }).id;
  }

  // snapshot catalog lines (only items belonging to the connected supplier).
  const ids = input.lines.map((l) => l.catalogItemId);
  const { data: items, error: itemErr } = await db
    .from('supplier_catalog_items')
    .select('id, name, sku, unit, unit_price, supplier_org_id, is_active')
    .in('id', ids);
  if (itemErr) throw new AppError(itemErr.message);
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  for (const l of input.lines) {
    const it = byId.get(l.catalogItemId);
    if (!it || it.supplier_org_id !== conn.supplier_org_id || !it.is_active) {
      throw new BusinessRuleError('Uno dei prodotti non appartiene al fornitore collegato o non è disponibile.');
    }
  }

  const { data: order, error: orderErr } = await db
    .from('marketplace_orders')
    .insert({
      customer_org_id: orgId, supplier_org_id: conn.supplier_org_id, connection_id: conn.id,
      status: 'draft', notes: input.notes || null, idempotency_key: input.idempotencyKey || null,
      created_by: null,
    } as never)
    .select('id').single();
  if (orderErr) throw new AppError(orderErr.message);
  const orderId = (order as { id: string }).id;

  const lineRows = input.lines.map((l, idx) => {
    const it = byId.get(l.catalogItemId)!;
    return {
      order_id: orderId, catalog_item_id: it.id, name_snapshot: it.name, sku_snapshot: it.sku,
      unit: it.unit, quantity: l.quantity, unit_price_snapshot: it.unit_price, sort_order: idx,
    };
  });
  const { error: linesErr } = await db.from('marketplace_order_lines').insert(lineRows as never);
  if (linesErr) throw new AppError(linesErr.message);

  await audit(db, orgId, 'order.created', 'marketplace_order', orderId, { supplier_org_id: conn.supplier_org_id });
  return orderId;
}

/** Create + submit in one step (the common "place order" UX). */
export async function placeOrder(raw: unknown): Promise<string> {
  const orderId = await createOrder(raw);
  await changeOrderStatus({ orderId, toStatus: 'submitted' });
  return orderId;
}

export async function changeOrderStatus(raw: unknown): Promise<void> {
  const session = await requireSession();
  const { orderId, toStatus, note } = changeStatusSchema.parse(raw);
  const accountType = (await getAccountType()) as AccountType | null;
  if (!accountType) throw new BusinessRuleError('Account non valido.');
  const db = await createMarketplaceClient();

  const { data: order, error } = await db
    .from('marketplace_orders')
    .select('id, status, customer_org_id, supplier_org_id')
    .eq('id', orderId).maybeSingle();
  if (error) throw new AppError(error.message);
  if (!order) throw new NotFoundError('Ordine');

  const from = order.status as MarketplaceOrderStatus;
  if (!canTransition(from, toStatus, accountType)) {
    throw new BusinessRuleError(`Transizione non consentita: ${from} → ${toStatus}.`);
  }

  // DB trigger re-validates transition + side + stamps timestamps + logs history.
  const { error: upErr } = await db
    .from('marketplace_orders').update({ status: toStatus } as never).eq('id', orderId);
  if (upErr) mapPgError(upErr.code, upErr.message);

  if (note) {
    await db.from('marketplace_order_status_history')
      .update({ note } as never)
      .eq('order_id', orderId).eq('to_status', toStatus);
  }
  await audit(db, session.organizationId, 'order.status_changed', 'marketplace_order', orderId, { from, to: toStatus });
}

export async function listOrders(): Promise<MarketplaceOrderSummary[]> {
  const session = await requireSession();
  const myOrg = session.organizationId;
  const db = await createMarketplaceClient();

  const { data: orders, error } = await db
    .from('marketplace_orders')
    .select('id, customer_org_id, supplier_org_id, status, created_at, submitted_at')
    .order('created_at', { ascending: false })
    .returns<{ id: string; customer_org_id: string; supplier_org_id: string; status: MarketplaceOrderStatus; created_at: string; submitted_at: string | null }[]>();
  if (error) throw new AppError(error.message);
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const counterpartyIds = orders.map((o) => (o.customer_org_id === myOrg ? o.supplier_org_id : o.customer_org_id));
  const [{ data: lines }, { data: orgs }] = await Promise.all([
    db.from('marketplace_order_lines').select('order_id, quantity, unit_price_snapshot').in('order_id', orderIds),
    db.from('organizations').select('id, name').in('id', counterpartyIds),
  ]);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const agg = new Map<string, { total: number; count: number }>();
  for (const l of lines ?? []) {
    const a = agg.get(l.order_id) ?? { total: 0, count: 0 };
    a.total += Number(l.quantity) * Number(l.unit_price_snapshot ?? 0);
    a.count += 1;
    agg.set(l.order_id, a);
  }

  return orders.map((o) => {
    const cpId = o.customer_org_id === myOrg ? o.supplier_org_id : o.customer_org_id;
    const a = agg.get(o.id) ?? { total: 0, count: 0 };
    return {
      id: o.id, customerOrgId: o.customer_org_id, supplierOrgId: o.supplier_org_id,
      counterpartyName: orgName.get(cpId) ?? '—', status: o.status,
      total: a.total, lineCount: a.count, createdAt: o.created_at, submittedAt: o.submitted_at,
    };
  });
}

export async function getOrder(orderId: string): Promise<MarketplaceOrderDetail> {
  const session = await requireSession();
  const myOrg = session.organizationId;
  const db = await createMarketplaceClient();

  const { data: o, error } = await db
    .from('marketplace_orders')
    .select('id, customer_org_id, supplier_org_id, connection_id, status, notes, created_at, submitted_at')
    .eq('id', orderId).maybeSingle()
    .returns<{ id: string; customer_org_id: string; supplier_org_id: string; connection_id: string; status: MarketplaceOrderStatus; notes: string | null; created_at: string; submitted_at: string | null } | null>();
  if (error) throw new AppError(error.message);
  if (!o) throw new NotFoundError('Ordine');

  const cpId = o.customer_org_id === myOrg ? o.supplier_org_id : o.customer_org_id;
  const [{ data: lines }, { data: history }, { data: org }] = await Promise.all([
    db.from('marketplace_order_lines').select('*').eq('order_id', orderId).order('sort_order'),
    db.from('marketplace_order_status_history').select('*').eq('order_id', orderId).order('created_at'),
    db.from('organizations').select('name').eq('id', cpId).maybeSingle(),
  ]);

  const mappedLines = (lines ?? []).map((l) => ({
    id: l.id, catalogItemId: l.catalog_item_id, name: l.name_snapshot, sku: l.sku_snapshot,
    unit: l.unit, quantity: Number(l.quantity), unitPrice: l.unit_price_snapshot, sortOrder: l.sort_order,
  }));
  const total = mappedLines.reduce((s, l) => s + l.quantity * Number(l.unitPrice ?? 0), 0);

  return {
    id: o.id, customerOrgId: o.customer_org_id, supplierOrgId: o.supplier_org_id,
    connectionId: o.connection_id, counterpartyName: (org as { name: string } | null)?.name ?? '—',
    status: o.status, total, lineCount: mappedLines.length, createdAt: o.created_at, submittedAt: o.submitted_at,
    notes: o.notes, lines: mappedLines,
    history: (history ?? []).map((h) => ({
      id: h.id, fromStatus: h.from_status, toStatus: h.to_status, note: h.note,
      createdAt: h.created_at, changedByOrgId: h.changed_by_org_id,
    })),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
async function loadMyConnection(db: Db, connectionId: string) {
  const { data, error } = await db
    .from('supplier_customer_connections')
    .select('id, supplier_org_id, customer_org_id, status')
    .eq('id', connectionId).maybeSingle();
  if (error) throw new AppError(error.message);
  if (!data || data.status !== 'active') throw new BusinessRuleError('Connessione fornitore non valida o revocata.');
  return data;
}

function toCatalogItem(i: { id: string; supplier_org_id: string; name: string; sku: string | null; unit: CatalogItem['unit']; unit_price: number | null; is_active: boolean }): CatalogItem {
  return { id: i.id, supplierOrgId: i.supplier_org_id, name: i.name, sku: i.sku, unit: i.unit, unitPrice: i.unit_price, isActive: i.is_active };
}
