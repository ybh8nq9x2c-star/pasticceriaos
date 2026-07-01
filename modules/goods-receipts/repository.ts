// =============================================================================
// modules/goods-receipts/repository.ts
// Solo query tipizzate (RLS-enforced). Zero logica di dominio.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { Database, ReceiptStatus } from '@/lib/database.types';
import type { CatalogProductRef } from './matching';
import type { ReceiptDetail, ReceiptLineView, ReceiptListItem, SupplierType } from './types';

type ReceiptRow = Database['public']['Tables']['purchase_receipts']['Row'];
type ReceiptInsert = Database['public']['Tables']['purchase_receipts']['Insert'];
type LineRow = Database['public']['Tables']['purchase_receipt_lines']['Row'];
type LineInsert = Database['public']['Tables']['purchase_receipt_lines']['Insert'];
type LineUpdate = Database['public']['Tables']['purchase_receipt_lines']['Update'];

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function toLineView(l: LineRow, productName: string | null): ReceiptLineView {
  return {
    id: l.id,
    productId: l.product_id,
    productName,
    rawProductName: l.raw_product_name,
    sku: l.sku,
    barcode: l.barcode,
    qtyExpected: numOrNull(l.qty_expected),
    qtyReceived: num(l.qty_received),
    qtyPosted: num(l.qty_posted),
    unit: l.unit,
    lotNumber: l.lot_number,
    expiryDate: l.expiry_date,
    discrepancyReason: l.discrepancy_reason,
    lineStatus: l.line_status,
    sortOrder: l.sort_order,
    scannedAt: l.scanned_at,
    gtin: l.gtin,
    sscc: l.sscc,
    caseQuantity: numOrNull(l.case_quantity),
    productionDate: l.production_date,
    gs1Raw: l.gs1_raw,
    gs1Ai: l.gs1_ai,
  };
}

export async function insertReceipt(row: ReceiptInsert): Promise<string> {
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('purchase_receipts')
    .insert(row)
    .select('id')
    .single();
  if (error) throw mapSupabaseError(error);
  return data.id;
}

export async function patchReceipt(
  id: string,
  fields: Database['public']['Tables']['purchase_receipts']['Update'],
): Promise<void> {
  const supabase = await createClient<Database>();
  const { error } = await supabase
    .from('purchase_receipts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw mapSupabaseError(error);
}

export async function insertLines(rows: LineInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = await createClient<Database>();
  const { error } = await supabase.from('purchase_receipt_lines').insert(rows);
  if (error) throw mapSupabaseError(error);
}

export async function insertLine(row: LineInsert): Promise<string> {
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('purchase_receipt_lines')
    .insert(row)
    .select('id')
    .single();
  if (error) throw mapSupabaseError(error);
  return data.id;
}

export async function patchLine(lineId: string, fields: LineUpdate): Promise<void> {
  const supabase = await createClient<Database>();
  const { error } = await supabase
    .from('purchase_receipt_lines')
    .update(fields)
    .eq('id', lineId);
  if (error) throw mapSupabaseError(error);
}

export async function getLineById(lineId: string): Promise<LineRow> {
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('purchase_receipt_lines')
    .select('*')
    .eq('id', lineId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Riga ricevimento');
  return data;
}

export async function getReceiptRow(id: string): Promise<ReceiptRow> {
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('purchase_receipts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Ricevimento');
  return data;
}

/** Ricevimento APERTO già collegato a un ordine (per riusarlo, niente doppioni). */
export async function findOpenReceiptIdForOrder(
  orgId: string,
  orderId: string,
): Promise<string | null> {
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('purchase_receipts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('purchase_order_id', orderId)
    .in('status', ['draft', 'expected', 'partial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  return data?.id ?? null;
}

export interface ListReceiptsFilter {
  status?: ReceiptStatus[] | null;
  supplierId?: string | null;
  search?: string | null;
}

export async function listReceipts(
  orgId: string,
  filter: ListReceiptsFilter = {},
): Promise<ReceiptListItem[]> {
  const supabase = await createClient<Database>();
  let q = supabase
    .from('purchase_receipts')
    .select('id, mode, status, supplier_id, ddt_number, ddt_date, purchase_order_id, created_at, completed_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter.status && filter.status.length > 0) q = q.in('status', filter.status);
  if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId);
  if (filter.search) q = q.ilike('ddt_number', `%${filter.search}%`);

  const { data: receipts, error } = await q;
  if (error) throw mapSupabaseError(error);
  if (!receipts || receipts.length === 0) return [];

  const ids = receipts.map((r) => r.id);
  const supplierIds = [...new Set(receipts.map((r) => r.supplier_id).filter((s): s is string => !!s))];

  const [linesRes, suppliersRes] = await Promise.all([
    supabase.from('purchase_receipt_lines').select('receipt_id, line_status').in('receipt_id', ids),
    supplierIds.length > 0
      ? supabase.from('suppliers').select('id, name').in('id', supplierIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (linesRes.error) throw mapSupabaseError(linesRes.error);
  if (suppliersRes.error) throw mapSupabaseError(suppliersRes.error);

  const counts = new Map<string, { total: number; received: number }>();
  for (const l of linesRes.data ?? []) {
    const c = counts.get(l.receipt_id) ?? { total: 0, received: 0 };
    c.total++;
    if (l.line_status === 'received') c.received++;
    counts.set(l.receipt_id, c);
  }
  const supplierName = new Map((suppliersRes.data ?? []).map((s) => [s.id, s.name]));

  return receipts.map((r) => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    supplierName: r.supplier_id ? supplierName.get(r.supplier_id) ?? null : null,
    ddtNumber: r.ddt_number,
    ddtDate: r.ddt_date,
    purchaseOrderId: r.purchase_order_id,
    linesCount: counts.get(r.id)?.total ?? 0,
    receivedCount: counts.get(r.id)?.received ?? 0,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));
}

export async function getReceiptDetail(id: string): Promise<ReceiptDetail> {
  const supabase = await createClient<Database>();
  const receipt = await getReceiptRow(id);

  const [linesRes, supplierRes] = await Promise.all([
    supabase
      .from('purchase_receipt_lines')
      .select('*')
      .eq('receipt_id', id)
      .order('sort_order')
      .order('created_at'),
    receipt.supplier_id
      ? supabase
          .from('suppliers')
          .select('id, name, supplier_org_id')
          .eq('id', receipt.supplier_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (linesRes.error) throw mapSupabaseError(linesRes.error);
  if (supplierRes.error) throw mapSupabaseError(supplierRes.error);

  const lines = linesRes.data ?? [];
  const productIds = [...new Set(lines.map((l) => l.product_id).filter((p): p is string => !!p))];
  const productName = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products, error } = await supabase
      .from('ingredient_products')
      .select('id, name')
      .in('id', productIds);
    if (error) throw mapSupabaseError(error);
    for (const p of products ?? []) productName.set(p.id, p.name);
  }

  const supplier = supplierRes.data
    ? {
        id: supplierRes.data.id,
        name: supplierRes.data.name,
        type: (supplierRes.data.supplier_org_id
          ? 'bakeryos_connected'
          : 'external_supplier') as SupplierType,
      }
    : null;

  return {
    id: receipt.id,
    organizationId: receipt.organization_id,
    mode: receipt.mode,
    status: receipt.status,
    supplier,
    purchaseOrderId: receipt.purchase_order_id,
    sourceDocumentId: receipt.source_document_id,
    ddtNumber: receipt.ddt_number,
    ddtDate: receipt.ddt_date,
    notes: receipt.notes,
    createdAt: receipt.created_at,
    completedAt: receipt.completed_at,
    lines: lines.map((l) => toLineView(l, l.product_id ? productName.get(l.product_id) ?? null : null)),
  };
}

/** Catalogo prodotti dell'org per il matcher (attivi). */
export async function listCatalogRefs(orgId: string): Promise<CatalogProductRef[]> {
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('ingredient_products')
    .select('id, name, sku, barcode, unit')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name');
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    unit: p.unit,
  }));
}
