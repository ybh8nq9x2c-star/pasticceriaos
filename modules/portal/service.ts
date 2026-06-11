// =============================================================================
// modules/portal/service.ts
// Portale fornitore via link JWT (nessuna registrazione).
// Tutte le query usano il client service-role con FILTRI ESPLICITI su
// supplier_id + organization_id presi dal token verificato: il token è il
// perimetro di autorizzazione, la versione sul fornitore ne permette la revoca.
// =============================================================================

import 'server-only';
import { verifySupplierToken, type SupplierTokenPayload } from '@/lib/supplier-token';
import { createAdminClient } from '@/lib/supabase/admin';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { OrderStatus, UnitOfMeasure, DocumentType } from '@/lib/database.types';

export interface PortalContext extends SupplierTokenPayload {
  supplierName: string;
  organizationName: string;
}

export interface PortalOrderListItem {
  id: string;
  status: OrderStatus;
  orderDate: string;
  expectedDate: string | null;
  lineCount: number;
  totalAmount: number | null;
}

export interface PortalOrderDetail extends PortalOrderListItem {
  notes: string | null;
  lines: {
    id: string;
    name: string;
    sku: string | null;
    quantity: number;
    unit: UnitOfMeasure;
    unitPrice: number | null;
  }[];
  documents: { id: string; documentType: DocumentType; documentNumber: string | null; createdAt: string }[];
}

/**
 * Verifica token + versione corrente sul fornitore (revoca) e ritorna il
 * contesto. Lancia su token invalido/scaduto/revocato.
 */
export async function getPortalContext(token: string): Promise<PortalContext> {
  const payload = await verifySupplierToken(token);
  const db = createAdminClient();

  // Niente embed: organizations è letta con query separata tipizzata.
  const { data: supplier, error } = await db
    .from('suppliers')
    .select('id, name, is_active, portal_token_version, organization_id')
    .eq('id', payload.supplierId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!supplier || !supplier.is_active) throw new NotFoundError('Fornitore');
  if ((supplier.portal_token_version ?? 1) !== payload.tokenVersion) {
    throw new BusinessRuleError('Link revocato: chiedi alla pasticceria un nuovo link.');
  }

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('name')
    .eq('id', payload.organizationId)
    .maybeSingle();
  if (orgErr) throw new Error(orgErr.message);

  return {
    ...payload,
    supplierName: supplier.name,
    organizationName: org?.name ?? 'Pasticceria',
  };
}

const PORTAL_VISIBLE_STATUSES: OrderStatus[] = ['sent', 'confirmed', 'received'];

export async function listPortalOrders(token: string): Promise<{ ctx: PortalContext; orders: PortalOrderListItem[] }> {
  const ctx = await getPortalContext(token);
  const db = createAdminClient();

  const { data, error } = await db
    .from('purchase_orders')
    .select('id, status, order_date, expected_date, total_amount, order_line_items(id, quantity_ordered, unit_price_snapshot)')
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', ctx.supplierId)
    .in('status', PORTAL_VISIBLE_STATUSES)
    .order('order_date', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const orders = (data ?? []).map((o) => {
    const lines = o.order_line_items ?? [];
    const total = lines.every((l) => l.unit_price_snapshot !== null)
      ? lines.reduce((s, l) => s + Number(l.quantity_ordered) * Number(l.unit_price_snapshot), 0)
      : null;
    return {
      id: o.id,
      status: o.status,
      orderDate: o.order_date,
      expectedDate: o.expected_date,
      lineCount: lines.length,
      totalAmount: total,
    };
  });

  return { ctx, orders };
}

export async function getPortalOrder(token: string, orderId: string): Promise<{ ctx: PortalContext; order: PortalOrderDetail }> {
  const ctx = await getPortalContext(token);
  const db = createAdminClient();

  const { data: o, error } = await db
    .from('purchase_orders')
    .select(`
      id, status, order_date, expected_date, notes, total_amount,
      order_line_items(id, quantity_ordered, unit, unit_price_snapshot, ingredient_products(name, sku))
    `)
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', ctx.supplierId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!o || !PORTAL_VISIBLE_STATUSES.includes(o.status)) throw new NotFoundError('Ordine');

  const { data: docs } = await db
    .from('commercial_documents')
    .select('id, document_type, document_number, created_at')
    .eq('purchase_order_id', orderId)
    .order('created_at', { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = ((o.order_line_items as any[]) ?? []).map((l) => ({
    id: l.id,
    name: l.ingredient_products?.name ?? 'Prodotto',
    sku: l.ingredient_products?.sku ?? null,
    quantity: Number(l.quantity_ordered),
    unit: l.unit as UnitOfMeasure,
    unitPrice: l.unit_price_snapshot !== null ? Number(l.unit_price_snapshot) : null,
  }));
  const total = lines.every((l) => l.unitPrice !== null)
    ? lines.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0)
    : null;

  return {
    ctx,
    order: {
      id: o.id,
      status: o.status,
      orderDate: o.order_date,
      expectedDate: o.expected_date,
      notes: o.notes,
      lineCount: lines.length,
      totalAmount: total,
      lines,
      documents: (docs ?? []).map((d) => ({
        id: d.id,
        documentType: d.document_type,
        documentNumber: d.document_number,
        createdAt: d.created_at,
      })),
    },
  };
}

/** Il fornitore conferma l'ordine: status sent->confirmed + history + notifica bakery. */
export async function portalConfirmOrder(token: string, orderId: string): Promise<void> {
  const ctx = await getPortalContext(token);
  const db = createAdminClient();

  const { data: o, error } = await db
    .from('purchase_orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', ctx.supplierId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) throw new NotFoundError('Ordine');
  if (o.status !== 'sent') {
    throw new BusinessRuleError(
      o.status === 'confirmed' ? 'Ordine già confermato.' : 'L\'ordine non è in attesa di conferma.',
    );
  }

  const { error: upErr } = await db
    .from('purchase_orders')
    .update({ status: 'confirmed' })
    .eq('id', orderId)
    .eq('status', 'sent'); // guard ottimistico contro doppio click
  if (upErr) throw new Error(upErr.message);

  await db.from('order_status_history').insert({
    purchase_order_id: orderId,
    from_status: 'sent',
    to_status: 'confirmed',
    changed_by: null,
    notes: `Confermato dal fornitore ${ctx.supplierName} via portale`,
  });

  await db.from('notifications').insert({
    organization_id: ctx.organizationId,
    type: 'info',
    title: `${ctx.supplierName} ha confermato un ordine`,
    message: `Ordine del ${new Date().toLocaleDateString('it-IT')} confermato dal portale fornitore.`,
    href: `/orders/${orderId}`,
  });
}

/** Il fornitore segnala un problema sull'ordine: history + notifica bakery. */
export async function portalReportIssue(token: string, orderId: string, message: string): Promise<void> {
  const ctx = await getPortalContext(token);
  const trimmed = message.trim();
  if (trimmed.length === 0) throw new BusinessRuleError('Descrivi il problema.');
  if (trimmed.length > 1000) throw new BusinessRuleError('Messaggio troppo lungo (max 1000).');

  const db = createAdminClient();
  const { data: o, error } = await db
    .from('purchase_orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', ctx.supplierId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) throw new NotFoundError('Ordine');

  await db.from('order_status_history').insert({
    purchase_order_id: orderId,
    from_status: o.status,
    to_status: o.status,
    changed_by: null,
    notes: `⚠️ Problema segnalato dal fornitore: ${trimmed}`,
  });

  await db.from('notifications').insert({
    organization_id: ctx.organizationId,
    type: 'warn',
    title: `${ctx.supplierName} segnala un problema su un ordine`,
    message: trimmed,
    href: `/orders/${orderId}`,
  });
}

/** Upload DDT/fattura dal portale: storage + commercial_documents con righe prefillate. */
export async function portalUploadDocument(
  token: string,
  orderId: string,
  input: {
    file: File | null;
    documentType: 'delivery_note' | 'invoice';
    documentNumber: string | null;
    documentDate: string;
    totalAmount: number | null;
  },
): Promise<string> {
  const ctx = await getPortalContext(token);
  const db = createAdminClient();

  const { data: o, error } = await db
    .from('purchase_orders')
    .select('id, status, order_line_items(id, quantity_ordered, unit, unit_price_snapshot, ingredient_products(name))')
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', ctx.supplierId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) throw new NotFoundError('Ordine');

  // Upload file (opzionale ma raccomandato)
  let storagePath: string | null = null;
  if (input.file && input.file.size > 0) {
    if (input.file.size > 10 * 1024 * 1024) throw new BusinessRuleError('File troppo grande (max 10MB).');
    const ext = (input.file.name.split('.').pop() ?? 'pdf').toLowerCase();
    storagePath = `${ctx.organizationId}/${input.documentType}/${Date.now()}-portal.${ext}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'commercial-documents';
    const { error: upErr } = await db.storage
      .from(bucket)
      .upload(storagePath, input.file, { contentType: input.file.type || 'application/pdf', upsert: false });
    if (upErr) throw new BusinessRuleError(`Upload fallito: ${upErr.message}`);
  }

  const { data: doc, error: docErr } = await db
    .from('commercial_documents')
    .insert({
      organization_id: ctx.organizationId,
      supplier_id: ctx.supplierId,
      purchase_order_id: orderId,
      document_type: input.documentType,
      document_number: input.documentNumber,
      document_date: input.documentDate,
      total_amount: input.totalAmount,
      storage_path: storagePath,
      uploaded_by_org_id: null, // caricato dal portale token, non da un'org
      notes: 'Caricato dal fornitore via portale',
    })
    .select('id')
    .single();
  if (docErr) throw new Error(docErr.message);

  // Righe documento prefillate dalle righe ordine (pronte per il matching bakery)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = ((o.order_line_items as any[]) ?? []).map((l) => ({
    document_id: doc.id,
    order_line_item_id: l.id,
    ingredient_product_id: null,
    description: l.ingredient_products?.name ?? 'Riga ordine',
    quantity: Number(l.quantity_ordered),
    unit: l.unit,
    unit_price: l.unit_price_snapshot,
  }));
  if (lines.length > 0) {
    const { error: linesErr } = await db.from('document_line_items').insert(lines);
    if (linesErr) throw new Error(linesErr.message);
  }

  await db.from('notifications').insert({
    organization_id: ctx.organizationId,
    type: 'info',
    title: `${ctx.supplierName} ha inviato un ${input.documentType === 'invoice' ? 'una fattura' : 'DDT'}`,
    message: input.documentNumber ? `Documento n. ${input.documentNumber}` : null,
    href: `/documents/${doc.id}`,
  });

  return doc.id as string;
}
