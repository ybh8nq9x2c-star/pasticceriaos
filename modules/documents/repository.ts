// =============================================================================
// modules/documents/repository.ts
// Solo query. Zero logica di matching (vive nel service).
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { DocumentType, DocumentStatus, AnomalyType, UnitOfMeasure } from '@/lib/database.types';
import type { CommercialDocument, DocumentListItem } from './types';

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface InsertDocumentRow {
  organizationId: string;
  supplierId: string | null;
  purchaseOrderId: string | null;
  marketplaceOrderId: string | null;
  documentType: DocumentType;
  documentNumber: string | null;
  documentDate: string;
  dueDate: string | null;
  totalAmount: number | null;
  notes: string | null;
  uploadedByOrgId: string | null;
  storagePath?: string | null;
}

export interface InsertLineRow {
  orderLineItemId: string | null;
  ingredientProductId: string | null;
  description: string;
  quantity: number;
  unit: UnitOfMeasure;
  unitPrice: number | null;
}

export async function insertDocument(doc: InsertDocumentRow, lines: InsertLineRow[]): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('commercial_documents')
    .insert({
      organization_id:      doc.organizationId,
      supplier_id:          doc.supplierId,
      purchase_order_id:    doc.purchaseOrderId,
      marketplace_order_id: doc.marketplaceOrderId,
      document_type:        doc.documentType,
      document_number:      doc.documentNumber,
      document_date:        doc.documentDate,
      due_date:             doc.dueDate,
      total_amount:         doc.totalAmount,
      notes:                doc.notes,
      uploaded_by_org_id:   doc.uploadedByOrgId,
      storage_path:         doc.storagePath ?? null,
    })
    .select('id')
    .single();
  if (error) throw mapSupabaseError(error);
  const documentId = data.id as string;

  if (lines.length > 0) {
    const { error: lineErr } = await supabase.from('document_line_items').insert(
      lines.map((l) => ({
        document_id:           documentId,
        order_line_item_id:    l.orderLineItemId,
        ingredient_product_id: l.ingredientProductId,
        description:           l.description,
        quantity:              l.quantity,
        unit:                  l.unit,
        unit_price:            l.unitPrice,
        line_total:            l.unitPrice !== null ? Math.round(l.quantity * l.unitPrice * 100) / 100 : null,
      })),
    );
    if (lineErr) throw mapSupabaseError(lineErr);
  }
  return documentId;
}

export async function listDocuments(orgId: string): Promise<DocumentListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('commercial_documents')
    .select('id, document_type, document_status, document_number, document_date, total_amount, purchase_order_id, suppliers(name), document_line_items(id), document_anomalies(id, resolved)')
    .eq('organization_id', orgId)
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((d) => ({
    id:              d.id,
    documentType:    d.document_type,
    documentStatus:  d.document_status,
    documentNumber:  d.document_number,
    documentDate:    d.document_date,
    totalAmount:     numOrNull(d.total_amount),
    supplierName:    (d.suppliers as { name: string } | null)?.name ?? null,
    purchaseOrderId: d.purchase_order_id,
    openAnomalies:   (d.document_anomalies ?? []).filter((a: { resolved: boolean }) => !a.resolved).length,
    linesCount:      (d.document_line_items ?? []).length,
  }));
}

export async function getDocumentById(id: string): Promise<CommercialDocument> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('commercial_documents')
    .select('*, suppliers(name), document_line_items(*), document_anomalies(*)')
    .eq('id', id)
    .single();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Documento');

  return {
    id:                 data.id,
    organizationId:     data.organization_id,
    supplierId:         data.supplier_id,
    supplierName:       (data.suppliers as { name: string } | null)?.name ?? null,
    purchaseOrderId:    data.purchase_order_id,
    marketplaceOrderId: data.marketplace_order_id,
    documentType:       data.document_type,
    documentStatus:     data.document_status,
    documentNumber:     data.document_number,
    documentDate:       data.document_date,
    dueDate:            data.due_date,
    subtotalAmount:     numOrNull(data.subtotal_amount),
    taxAmount:          numOrNull(data.tax_amount),
    totalAmount:        numOrNull(data.total_amount),
    notes:              data.notes,
    storagePath:        data.storage_path ?? null,
    uploadedByOrgId:    data.uploaded_by_org_id,
    matchedAt:          data.matched_at,
    createdAt:          data.created_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: ((data.document_line_items as any[]) ?? []).map((l) => ({
      id:                  l.id,
      orderLineItemId:     l.order_line_item_id,
      ingredientProductId: l.ingredient_product_id,
      description:         l.description,
      quantity:            num(l.quantity),
      unit:                l.unit,
      unitPrice:           numOrNull(l.unit_price),
      lineTotal:           numOrNull(l.line_total),
      quantityVariance:    numOrNull(l.quantity_variance),
      priceVariance:       numOrNull(l.price_variance),
      matchedAt:           l.matched_at,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anomalies: ((data.document_anomalies as any[]) ?? []).map((a) => ({
      id:            a.id,
      anomalyType:   a.anomaly_type,
      description:   a.description,
      expectedValue: a.expected_value,
      actualValue:   a.actual_value,
      resolved:      a.resolved,
      resolvedAt:    a.resolved_at,
    })),
  };
}

export async function patchDocument(
  id: string,
  fields: {
    status?: DocumentStatus;
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    matchedAt?: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('commercial_documents')
    .update({
      document_status:   fields.status,
      purchase_order_id: fields.purchaseOrderId,
      supplier_id:       fields.supplierId,
      matched_at:        fields.matchedAt,
    })
    .eq('id', id);
  if (error) throw mapSupabaseError(error);
}

export async function patchLineMatch(
  lineId: string,
  fields: {
    orderLineItemId: string | null;
    ingredientProductId: string | null;
    quantityVariance: number | null;
    priceVariance: number | null;
    matchedAt: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('document_line_items')
    .update({
      order_line_item_id:    fields.orderLineItemId,
      ingredient_product_id: fields.ingredientProductId,
      quantity_variance:     fields.quantityVariance,
      price_variance:        fields.priceVariance,
      matched_at:            fields.matchedAt,
    })
    .eq('id', lineId);
  if (error) throw mapSupabaseError(error);
}

export async function deleteAnomalies(documentId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('document_anomalies')
    .delete()
    .eq('document_id', documentId)
    .eq('resolved', false);
  if (error) throw mapSupabaseError(error);
}

export async function insertAnomalies(
  documentId: string,
  anomalies: { anomalyType: AnomalyType; description: string; expectedValue: string | null; actualValue: string | null }[],
): Promise<void> {
  if (anomalies.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from('document_anomalies').insert(
    anomalies.map((a) => ({
      document_id:    documentId,
      anomaly_type:   a.anomalyType,
      description:    a.description,
      expected_value: a.expectedValue,
      actual_value:   a.actualValue,
    })),
  );
  if (error) throw mapSupabaseError(error);
}

export async function resolveAnomaly(anomalyId: string, userId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_anomalies')
    .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq('id', anomalyId)
    .select('document_id')
    .single();
  if (error) throw mapSupabaseError(error);
  return data.document_id as string;
}

export async function countOpenAnomalies(documentId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('document_anomalies')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .eq('resolved', false);
  if (error) throw mapSupabaseError(error);
  return count ?? 0;
}
