// =============================================================================
// modules/documents/service.ts
// Business logic ciclo documentale: creazione, matching documento↔ordine,
// anomalie, aggiornamento prezzi da fattura verificata.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { requireSupplierSession } from '@/modules/identity/workspace';
import { createClient } from '@/lib/supabase/server';
import { uploadCommercialDocument } from '@/lib/storage';
import { AuthError, BusinessRuleError, NotFoundError, mapSupabaseError } from '@/lib/errors';
import * as repo from './repository';
import { normalizeName } from './matching';
import { createDocumentSchema, supplierUploadSchema, resolveAnomalySchema } from './schemas';
import type { CommercialDocument, DocumentListItem } from './types';
import type { AnomalyType } from '@/lib/database.types';

const QTY_EPSILON = 0.001;
/** Soglia anomalia prezzo: 1% del prezzo ordinato, minimo 1 centesimo. */
function priceThreshold(orderedPrice: number): number {
  return Math.max(0.01, Math.abs(orderedPrice) * 0.01);
}


// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listDocuments(): Promise<DocumentListItem[]> {
  const orgId = await requireOrgId();
  return repo.listDocuments(orgId);
}

export async function getDocument(id: string): Promise<CommercialDocument> {
  const orgId = await requireOrgId();
  const doc = await repo.getDocumentById(id);
  if (doc.organizationId !== orgId) throw new NotFoundError('Documento');
  return doc;
}

// ---------------------------------------------------------------------------
// Creazione (lato bakery)
// ---------------------------------------------------------------------------

export async function createDocument(raw: unknown, file?: File | null): Promise<string> {
  const orgId = await requireOrgId();
  const input = createDocumentSchema.parse(raw);

  // Upload del PDF/foto PRIMA del record: se fallisce, nessun documento orfano.
  let storagePath: string | null = null;
  if (file && file.size > 0) {
    storagePath = await uploadCommercialDocument(file, orgId, input.documentType);
  }

  const documentId = await repo.insertDocument(
    {
      organizationId:     orgId,
      supplierId:         input.supplierId,
      purchaseOrderId:    input.purchaseOrderId || null,
      marketplaceOrderId: null,
      documentType:       input.documentType,
      documentNumber:     input.documentNumber || null,
      documentDate:       input.documentDate,
      dueDate:            input.dueDate || null,
      totalAmount:        input.totalAmount,
      notes:              input.notes || null,
      uploadedByOrgId:    orgId,
      storagePath,
    },
    input.lines.map((l) => ({
      orderLineItemId:     l.orderLineItemId || null,
      ingredientProductId: l.ingredientProductId || null,
      description:         l.description,
      quantity:            l.quantity,
      unit:                l.unit,
      unitPrice:           l.unitPrice,
    })),
  );

  // Matching automatico se il documento è già agganciato a un ordine.
  if (input.purchaseOrderId) {
    await matchDocumentToOrder(documentId);
  }
  return documentId;
}

// ---------------------------------------------------------------------------
// Matching documento ↔ ordine
// ---------------------------------------------------------------------------

interface OrderLineRow {
  id: string;
  ingredient_product_id: string;
  quantity_ordered: number;
  unit_price_snapshot: number | null;
  ingredient_products: { name: string } | null;
}

export async function matchDocumentToOrder(
  documentId: string,
  purchaseOrderId?: string,
): Promise<{ status: 'matched' | 'anomaly'; anomaliesCount: number }> {
  const orgId = await requireOrgId();
  const doc = await repo.getDocumentById(documentId);
  if (doc.organizationId !== orgId) throw new NotFoundError('Documento');

  const supabase = await createClient();

  // Auto-associazione: se il documento nasce da un ordine marketplace e la
  // merce è già stata registrata, il PO specchio è ricavabile senza che
  // l'utente debba selezionarlo a mano (BUG-03).
  let targetOrderId = purchaseOrderId ?? doc.purchaseOrderId;
  if (!targetOrderId && doc.marketplaceOrderId) {
    const { data: mirrorPo, error: mirrorErr } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('marketplace_order_id', doc.marketplaceOrderId)
      .maybeSingle();
    if (mirrorErr) throw mapSupabaseError(mirrorErr);
    targetOrderId = mirrorPo?.id ?? null;
    if (!targetOrderId) {
      throw new BusinessRuleError(
        'La merce di questo ordine non è ancora stata registrata a magazzino: ' +
        'registra il carico dall\'ordine marketplace, poi esegui la verifica.',
      );
    }
  }
  if (!targetOrderId) {
    throw new BusinessRuleError('Associa il documento a un ordine prima di eseguire il matching.');
  }
  const { data: orderLines, error } = await supabase
    .from('order_line_items')
    .select('id, ingredient_product_id, quantity_ordered, unit_price_snapshot, ingredient_products(name)')
    .eq('purchase_order_id', targetOrderId)
    .returns<OrderLineRow[]>();
  if (error) throw mapSupabaseError(error);
  if (!orderLines || orderLines.length === 0) {
    throw new BusinessRuleError('L\'ordine selezionato non ha righe.');
  }

  // Reset anomalie aperte precedenti (re-matching idempotente).
  await repo.deleteAnomalies(documentId);

  const anomalies: { anomalyType: AnomalyType; description: string; expectedValue: string | null; actualValue: string | null }[] = [];
  const now = new Date().toISOString();
  const matchedOrderLineIds = new Set<string>();

  for (const line of doc.lines) {
    // Match in ordine di affidabilità: 1) order_line_item_id esplicito,
    // 2) ingrediente, 3) fallback per nome normalizzato — necessario per le
    // righe caricate dal fornitore, che non conoscono gli ID del cliente
    // (BUG-03: senza fallback ogni riga risultava "non ordinata"+"mancante").
    const lineName = normalizeName(line.description);
    const target =
      (line.orderLineItemId && orderLines.find((o) => o.id === line.orderLineItemId)) ||
      (line.ingredientProductId &&
        orderLines.find(
          (o) => o.ingredient_product_id === line.ingredientProductId && !matchedOrderLineIds.has(o.id),
        )) ||
      (lineName !== '' &&
        orderLines.find(
          (o) => normalizeName(o.ingredient_products?.name) === lineName && !matchedOrderLineIds.has(o.id),
        )) ||
      null;

    if (!target) {
      anomalies.push({
        anomalyType: 'extra_item',
        description: `"${line.description}" non corrisponde ad alcuna riga dell'ordine.`,
        expectedValue: null,
        actualValue: `${line.quantity} ${line.unit}`,
      });
      await repo.patchLineMatch(line.id, {
        orderLineItemId: null,
        ingredientProductId: line.ingredientProductId,
        quantityVariance: null,
        priceVariance: null,
        matchedAt: null,
      });
      continue;
    }

    matchedOrderLineIds.add(target.id);
    const ordered = Number(target.quantity_ordered);
    const orderedPrice = target.unit_price_snapshot !== null ? Number(target.unit_price_snapshot) : null;

    const qtyVariance = Math.round((line.quantity - ordered) * 10000) / 10000;
    const priceVariance =
      line.unitPrice !== null && orderedPrice !== null
        ? Math.round((line.unitPrice - orderedPrice) * 10000) / 10000
        : null;

    if (Math.abs(qtyVariance) > QTY_EPSILON) {
      anomalies.push({
        anomalyType: 'quantity_mismatch',
        description: `${line.description}: quantità documento diversa dall'ordinato.`,
        expectedValue: `${ordered} ${line.unit}`,
        actualValue: `${line.quantity} ${line.unit}`,
      });
    }
    if (priceVariance !== null && orderedPrice !== null && Math.abs(priceVariance) > priceThreshold(orderedPrice)) {
      const pct = orderedPrice > 0 ? Math.round((priceVariance / orderedPrice) * 1000) / 10 : null;
      anomalies.push({
        anomalyType: 'price_mismatch',
        description: `${line.description}: prezzo documento diverso dallo snapshot ordine${pct !== null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}.`,
        expectedValue: `€${orderedPrice.toFixed(4)}`,
        actualValue: `€${line.unitPrice!.toFixed(4)}`,
      });
    }

    await repo.patchLineMatch(line.id, {
      orderLineItemId: target.id,
      ingredientProductId: target.ingredient_product_id,
      quantityVariance: qtyVariance,
      priceVariance,
      matchedAt: now,
    });
  }

  // Righe ordine senza corrispondenza nel documento
  for (const o of orderLines) {
    if (!matchedOrderLineIds.has(o.id)) {
      anomalies.push({
        anomalyType: 'missing_item',
        description: `"${o.ingredient_products?.name ?? 'Riga ordine'}" ordinato ma assente dal documento.`,
        expectedValue: `${Number(o.quantity_ordered)}`,
        actualValue: null,
      });
    }
  }

  // Coerenza totale documento vs somma righe documento
  if (doc.totalAmount !== null) {
    const linesTotal = doc.lines.reduce(
      (s, l) => s + (l.unitPrice !== null ? l.quantity * l.unitPrice : 0),
      0,
    );
    if (doc.lines.every((l) => l.unitPrice !== null) && Math.abs(linesTotal - doc.totalAmount) > 0.01) {
      anomalies.push({
        anomalyType: 'total_mismatch',
        description: 'Il totale dichiarato non coincide con la somma delle righe.',
        expectedValue: `€${linesTotal.toFixed(2)}`,
        actualValue: `€${doc.totalAmount.toFixed(2)}`,
      });
    }
  }

  await repo.insertAnomalies(documentId, anomalies);

  // Backfill fornitore: i documenti caricati dal fornitore possono nascere
  // senza supplier_id (anagrafica cliente non ancora creata al momento
  // dell'upload); l'ordine associato lo conosce.
  let supplierIdPatch: string | null | undefined;
  if (!doc.supplierId) {
    const { data: poSupplier, error: poSupErr } = await supabase
      .from('purchase_orders')
      .select('supplier_id')
      .eq('id', targetOrderId)
      .maybeSingle();
    if (poSupErr) throw mapSupabaseError(poSupErr);
    supplierIdPatch = poSupplier?.supplier_id ?? undefined;
  }

  const status = anomalies.length === 0 ? 'matched' : 'anomaly';
  await repo.patchDocument(documentId, {
    status,
    purchaseOrderId: targetOrderId,
    supplierId: supplierIdPatch,
    matchedAt: status === 'matched' ? now : null,
  });

  // Fattura verificata senza anomalie -> i prezzi fattura diventano i prezzi
  // correnti degli ingredienti (source of truth della cache prezzo).
  if (status === 'matched' && doc.documentType === 'invoice') {
    for (const line of doc.lines) {
      if (line.unitPrice !== null && line.ingredientProductId) {
        const { error: priceErr } = await supabase
          .from('ingredient_products')
          .update({ unit_price: line.unitPrice })
          .eq('id', line.ingredientProductId);
        if (priceErr) throw mapSupabaseError(priceErr);
      }
    }
  }

  return { status, anomaliesCount: anomalies.length };
}

// ---------------------------------------------------------------------------
// Anomalie
// ---------------------------------------------------------------------------

export async function resolveAnomaly(raw: unknown): Promise<void> {
  await requireOrgId();
  const { anomalyId } = resolveAnomalySchema.parse(raw);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const documentId = await repo.resolveAnomaly(anomalyId, user.id);

  // Ultima anomalia risolta -> il documento diventa verificato.
  const open = await repo.countOpenAnomalies(documentId);
  if (open === 0) {
    await repo.patchDocument(documentId, { status: 'matched', matchedAt: new Date().toISOString() });
  }
}

export async function archiveDocument(id: string): Promise<void> {
  const orgId = await requireOrgId();
  const doc = await repo.getDocumentById(id);
  if (doc.organizationId !== orgId) throw new NotFoundError('Documento');
  await repo.patchDocument(id, { status: 'archived' });
}

// ---------------------------------------------------------------------------
// Upload dal supplier workspace (org fornitore)
// ---------------------------------------------------------------------------

export async function supplierUploadDocument(raw: unknown): Promise<string> {
  const { orgId: supplierOrgId } = await requireSupplierSession();
  const input = supplierUploadSchema.parse(raw);

  const supabase = await createClient();
  const { data: mo, error } = await supabase
    .from('marketplace_orders')
    .select('id, customer_org_id, supplier_org_id, status')
    .eq('id', input.marketplaceOrderId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!mo || mo.supplier_org_id !== supplierOrgId) throw new NotFoundError('Ordine');
  if (mo.status === 'draft' || mo.status === 'cancelled') {
    throw new BusinessRuleError('Puoi allegare documenti solo a ordini attivi.');
  }

  // Anagrafica fornitore lato cliente, se già creata dal ponte ricezione.
  const { data: supplierRow } = await supabase
    .from('suppliers')
    .select('id')
    .eq('organization_id', mo.customer_org_id)
    .eq('supplier_org_id', supplierOrgId)
    .maybeSingle();

  // PO specchio, se la merce è già stata registrata a magazzino.
  const { data: poRow } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('marketplace_order_id', mo.id)
    .maybeSingle();

  // Se il PO specchio esiste, le sue righe permettono di popolare subito
  // order_line_item_id / ingredient_product_id sulle righe documento
  // (BUG-03: la provenienza è nota, gli ID non devono restare null).
  // Mappa per nome normalizzato: è la stessa chiave usata dal ponte di
  // ricezione per creare le righe PO dagli snapshot marketplace.
  const poLineByName = new Map<string, { id: string; ingredient_product_id: string }>();
  if (poRow) {
    const { data: poLines, error: poLinesErr } = await supabase
      .from('order_line_items')
      .select('id, ingredient_product_id, ingredient_products(name)')
      .eq('purchase_order_id', poRow.id)
      .returns<{ id: string; ingredient_product_id: string; ingredient_products: { name: string } | null }[]>();
    if (poLinesErr) throw mapSupabaseError(poLinesErr);
    for (const pl of poLines ?? []) {
      const key = normalizeName(pl.ingredient_products?.name);
      if (key && !poLineByName.has(key)) {
        poLineByName.set(key, { id: pl.id, ingredient_product_id: pl.ingredient_product_id });
      }
    }
  }

  // Le righe del documento sono lo snapshot delle righe ordine marketplace.
  const { data: moLines, error: linesErr } = await supabase
    .from('marketplace_order_lines')
    .select('name_snapshot, quantity, unit, unit_price_snapshot')
    .eq('order_id', mo.id)
    .order('sort_order');
  if (linesErr) throw mapSupabaseError(linesErr);

  return repo.insertDocument(
    {
      organizationId:     mo.customer_org_id,
      supplierId:         supplierRow?.id ?? null,
      purchaseOrderId:    poRow?.id ?? null,
      marketplaceOrderId: mo.id,
      documentType:       input.documentType,
      documentNumber:     input.documentNumber || null,
      documentDate:       input.documentDate,
      dueDate:            null,
      totalAmount:        input.totalAmount,
      notes:              input.notes || null,
      uploadedByOrgId:    supplierOrgId,
    },
    (moLines ?? []).map((l) => {
      const poLine = poLineByName.get(normalizeName(l.name_snapshot)) ?? null;
      return {
        orderLineItemId:     poLine?.id ?? null,
        ingredientProductId: poLine?.ingredient_product_id ?? null,
        description:         l.name_snapshot,
        quantity:            Number(l.quantity),
        unit:                l.unit,
        unitPrice:           l.unit_price_snapshot !== null ? Number(l.unit_price_snapshot) : null,
      };
    }),
  );
}
