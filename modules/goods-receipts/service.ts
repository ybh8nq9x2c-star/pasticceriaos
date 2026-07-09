// =============================================================================
// modules/goods-receipts/service.ts
// Business logic del GOODS RECEIPT ENGINE (unico per supplier e bakery).
//
// REGOLA NON NEGOZIABILE: lo stock cambia SOLO tramite la RPC transazionale
// complete_purchase_receipt (movimenti inbound + lotti + ordine collegato).
// Qui si gestisce il ciclo di vita del receipt e il matching; mai update
// diretti delle giacenze.
//
// RUOLI (coerenti col resto dell'app): qualunque membro dell'organizzazione
// può creare/aggiornare/completare ricevimenti e registrare discrepanze
// (stessa policy delle altre scritture operative, RLS per org). La creazione
// prodotto al volo riusa il catalog service (nessun gate aggiuntivo oggi).
// =============================================================================

import { requireOrgId, requireSession } from '@/modules/identity/service';
import { createClient } from '@/lib/supabase/server';
import { uploadCommercialDocument } from '@/lib/storage';
import { AuthError, BusinessRuleError, mapSupabaseError, NotFoundError } from '@/lib/errors';
import * as documentsRepo from '@/modules/documents/repository';
import { createIngredient } from '@/modules/catalog/service';
import type { Database, ReceiptStatus, UnitOfMeasure } from '@/lib/database.types';
import * as repo from './repository';
import {
  addLineSchema,
  createProductFromLineSchema,
  createReceiptSchema,
  importDdtSchema,
  resolveLineProductSchema,
  scanSchema,
  updateLineSchema,
} from './schemas';
import {
  AUTO_MATCH_THRESHOLD,
  matchProduct,
  normalizeBarcode,
  suggestProducts,
  type CatalogProductRef,
  type ProductMatch,
} from './matching';
import { parseDdtText, type ParsedDdt } from './ddt-parser';
import { extractPdfText } from './pdf-text';
import { parseGs1, gs1ToLineFields } from './gs1';
import { convertQty, unitConversionFactor } from './units';
import type { ReceiptDetail, ReceiptListItem, ReceiptMode } from './types';

const OPEN_STATUSES: ReceiptStatus[] = ['draft', 'expected', 'partial'];

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();
  return user.id;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listReceipts(filter: repo.ListReceiptsFilter = {}): Promise<ReceiptListItem[]> {
  const orgId = await requireOrgId();
  return repo.listReceipts(orgId, filter);
}

export async function getReceipt(id: string): Promise<ReceiptDetail> {
  const orgId = await requireOrgId();
  const detail = await repo.getReceiptDetail(id);
  if (detail.organizationId !== orgId) throw new NotFoundError('Ricevimento');
  return detail;
}

export interface ScanLookupResult {
  match: ProductMatch | null;
  suggestions: ProductMatch[];
}

/** Lookup prodotto per scanner / inserimento manuale del codice. */
export async function lookupProduct(codeOrName: string): Promise<ScanLookupResult> {
  const orgId = await requireOrgId();
  const catalog = await repo.listCatalogRefs(orgId);
  const match = matchProduct(catalog, {
    barcode: codeOrName,
    sku: codeOrName,
    name: codeOrName,
  });
  if (match && match.confidence >= AUTO_MATCH_THRESHOLD) return { match, suggestions: [] };
  return { match: null, suggestions: suggestProducts(catalog, codeOrName, 5) };
}

// ---------------------------------------------------------------------------
// Creazione receipt
// ---------------------------------------------------------------------------

export async function createReceipt(raw: unknown): Promise<string> {
  const orgId = await requireOrgId();
  const userId = await requireUserId();
  const input = createReceiptSchema.parse(raw);

  let status: ReceiptStatus = 'draft';
  let lines: Database['public']['Tables']['purchase_receipt_lines']['Insert'][] = [];
  let supplierId = input.supplierId || null;

  // P1-B: se per QUESTO ordine c'è già un ricevimento aperto, riusalo — mai
  // doppioni da "Nuovo" premuto al posto di "riprendi" (stessa semantica di
  // receiveOrderInFull).
  if (input.purchaseOrderId) {
    const existing = await repo.findOpenReceiptIdForOrder(orgId, input.purchaseOrderId);
    if (existing) return existing;
  }

  // Ricevimento ATTESO da ordine esistente: precompila le righe dall'ordine.
  if (input.purchaseOrderId) {
    const supabase = await createClient<Database>();
    const { data: order, error } = await supabase
      .from('purchase_orders')
      .select('id, organization_id, status, supplier_id')
      .eq('id', input.purchaseOrderId)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);
    if (!order || order.organization_id !== orgId) throw new NotFoundError('Ordine');
    if (order.status === 'received') {
      throw new BusinessRuleError('Questo ordine risulta già ricevuto a magazzino.');
    }
    if (order.status === 'cancelled' || order.status === 'draft') {
      throw new BusinessRuleError(
        'Puoi creare un ricevimento solo da ordini inviati o confermati.',
      );
    }

    // Backfill fornitore dall'ordine: chi collega un ordine non deve (ri)dire
    // chi è il fornitore, e nessun caller futuro può dimenticarselo.
    if (!supplierId) supplierId = order.supplier_id;

    const { data: orderLines, error: linesErr } = await supabase
      .from('order_line_items')
      .select('ingredient_product_id, quantity_ordered, quantity_received, unit, ingredient_products(name, sku, barcode)')
      .eq('purchase_order_id', input.purchaseOrderId)
      .returns<{
        ingredient_product_id: string;
        quantity_ordered: number;
        quantity_received: number | null;
        unit: UnitOfMeasure;
        ingredient_products: { name: string; sku: string | null; barcode: string | null } | null;
      }[]>();
    if (linesErr) throw mapSupabaseError(linesErr);

    lines = (orderLines ?? []).map((l, i) => ({
      receipt_id: '', // valorizzato sotto
      product_id: l.ingredient_product_id,
      raw_product_name: l.ingredient_products?.name ?? 'Riga ordine',
      sku: l.ingredient_products?.sku ?? null,
      barcode: l.ingredient_products?.barcode ?? null,
      qty_expected: Math.max(0.0001, Number(l.quantity_ordered) - Number(l.quantity_received ?? 0)),
      unit: l.unit,
      line_status: 'matched' as const,
      sort_order: i,
    }));
    status = 'expected';
  }

  const receiptId = await repo.insertReceipt({
    organization_id: orgId,
    mode: input.mode,
    supplier_id: supplierId,
    purchase_order_id: input.purchaseOrderId || null,
    ddt_number: input.ddtNumber || null,
    ddt_date: input.ddtDate || null,
    status,
    notes: input.notes || null,
    created_by: userId,
  });

  if (lines.length > 0) {
    await repo.insertLines(lines.map((l) => ({ ...l, receipt_id: receiptId })));
  }
  return receiptId;
}

export interface ImportDdtResult {
  receiptId: string;
  parsed: ParsedDdt;
  matchedCount: number;
  unmatchedCount: number;
}

/**
 * Import DDT PDF: estrae testo → parsing → documento conservato (storage +
 * commercial_documents) → receipt 'expected' con righe matchate sul catalogo.
 * Best-effort: righe non riconosciute restano 'pending' e si risolvono in UI.
 */
export async function importDdt(raw: unknown, file: File): Promise<ImportDdtResult> {
  const orgId = await requireOrgId();
  const userId = await requireUserId();
  const input = importDdtSchema.parse(raw);

  const text = await extractPdfText(file);
  const parsed = parseDdtText(text);

  // Il DDT viene SEMPRE conservato come documento collegato (tracciabilità).
  let storagePath: string | null = null;
  try {
    storagePath = await uploadCommercialDocument(file, orgId, 'delivery_note');
  } catch (err) {
    // Storage non configurato non deve bloccare il ricevimento: logga e prosegui.
    console.error('[goods-receipts] upload DDT su storage fallito', err);
    parsed.warnings.push('Archiviazione del PDF non riuscita: il file non sarà consultabile dal documento.');
  }

  const documentId = await documentsRepo.insertDocument(
    {
      organizationId: orgId,
      supplierId: input.supplierId || null,
      purchaseOrderId: null,
      marketplaceOrderId: null,
      documentType: 'delivery_note',
      documentNumber: parsed.header.ddtNumber,
      documentDate: parsed.header.ddtDate ?? new Date().toISOString().slice(0, 10),
      dueDate: null,
      totalAmount: null,
      notes: parsed.header.supplierName
        ? `Importato dal goods receipt engine — mittente dichiarato: ${parsed.header.supplierName}`
        : 'Importato dal goods receipt engine.',
      uploadedByOrgId: orgId,
      storagePath,
    },
    parsed.lines.map((l) => ({
      orderLineItemId: null,
      ingredientProductId: null,
      description: l.rawName,
      quantity: l.qty,
      unit: l.unit,
      unitPrice: null,
    })),
  );

  // Matching righe → catalogo dell'org (PRIMA di creare il receipt, così gli
  // avvisi sulle unità finiscono nelle note). UNITÀ: mai coercizzare all'unità
  // del prodotto senza convertire la quantità (DDT "25 kg" su prodotto in
  // grammi deve diventare 25000 g, non "25 g"). Unità NON convertibile → il
  // match automatico decade a 'pending' con avviso: decide l'operatore.
  const catalog = await repo.listCatalogRefs(orgId);
  let matched = 0;
  const preparedLines = parsed.lines.map((l, i) => {
    const m = matchProduct(catalog, { sku: l.sku, name: l.rawName });
    let auto = Boolean(m && m.confidence >= AUTO_MATCH_THRESHOLD);
    let qtyExpected = l.qty;
    let unit: UnitOfMeasure = l.unit;
    if (auto && m) {
      const converted = convertQty(l.qty, l.unit, m.product.unit);
      if (converted === null) {
        auto = false;
        parsed.warnings.push(
          `"${l.rawName}": unità DDT (${l.unit}) non convertibile in quella del prodotto "${m.product.name}" (${m.product.unit}) — riga da risolvere manualmente.`,
        );
      } else {
        qtyExpected = converted;
        unit = m.product.unit;
      }
    }
    if (auto) matched++;
    return {
      product_id: auto && m ? m.product.id : null,
      raw_product_name: l.rawName,
      sku: l.sku,
      qty_expected: qtyExpected,
      unit,
      lot_number: l.lotNumber,
      line_status: (auto ? 'matched' : 'pending') as Database['public']['Tables']['purchase_receipt_lines']['Insert']['line_status'],
      sort_order: i,
    };
  });

  const receiptId = await repo.insertReceipt({
    organization_id: orgId,
    mode: input.mode,
    supplier_id: input.supplierId || null,
    source_document_id: documentId,
    ddt_number: parsed.header.ddtNumber,
    ddt_date: parsed.header.ddtDate,
    status: 'expected',
    notes: parsed.warnings.length > 0 ? `Avvisi parser: ${parsed.warnings.join(' · ')}` : null,
    created_by: userId,
  });

  await repo.insertLines(preparedLines.map((l) => ({ ...l, receipt_id: receiptId })));

  return {
    receiptId,
    parsed,
    matchedCount: matched,
    unmatchedCount: parsed.lines.length - matched,
  };
}

// ---------------------------------------------------------------------------
// Righe: scan, aggiornamento, risoluzione matching
// ---------------------------------------------------------------------------

function assertOpen(status: ReceiptStatus): void {
  if (!OPEN_STATUSES.includes(status)) {
    throw new BusinessRuleError(
      `Il ricevimento è "${status}": non è più modificabile.`,
    );
  }
}

export interface ScanOutcome {
  status: 'matched' | 'unmatched';
  lineId: string | null;
  productName: string | null;
  suggestions: ProductMatch[];
}

/**
 * Registra una lettura barcode sul receipt:
 *  • se esiste già una riga per quel prodotto/codice → incrementa qty_received;
 *  • altrimenti crea una riga nuova (matchata se il codice è in catalogo).
 * Un codice ignoto NON è un errore: torna 'unmatched' con suggerimenti.
 */
export async function registerScan(raw: unknown): Promise<ScanOutcome> {
  const orgId = await requireOrgId();
  const userId = await requireUserId();
  const input = scanSchema.parse(raw);

  const receipt = await repo.getReceiptRow(input.receiptId);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');
  assertOpen(receipt.status);

  const code = normalizeBarcode(input.code) || input.code.trim();
  const catalog = await repo.listCatalogRefs(orgId);
  const match = matchProduct(catalog, { barcode: input.code, sku: input.code });
  const now = new Date().toISOString();

  // Tracciabilità GS1: riparsa il raw payload (server = unica fonte) e ricava le
  // colonne canoniche + raw + mappa AI completa. Nessun dato GS1 utile va perso.
  const gs1 = input.gs1Raw ? gs1ToLineFields(parseGs1(input.gs1Raw)) : null;
  const gs1Cols = gs1
    ? {
        gtin: gs1.gtin,
        sscc: gs1.sscc,
        case_quantity: gs1.caseQuantity,
        production_date: gs1.productionDate,
        gs1_raw: gs1.gs1Raw,
        gs1_ai: gs1.gs1Ai,
      }
    : {};

  const detail = await repo.getReceiptDetail(input.receiptId);

  if (match && match.confidence >= AUTO_MATCH_THRESHOLD) {
    // Riga esistente per lo stesso prodotto (e stesso lotto, se indicato).
    const existing = detail.lines.find(
      (l) => l.productId === match.product.id && (l.lotNumber ?? '') === (input.lotNumber || ''),
    );
    if (existing) {
      await repo.patchLine(existing.id, {
        qty_received: existing.qtyReceived + input.qty,
        lot_number: input.lotNumber || existing.lotNumber,
        expiry_date: input.expiryDate || existing.expiryDate,
        scanned_by: userId,
        scanned_at: now,
        line_status: existing.lineStatus === 'pending' ? 'matched' : existing.lineStatus,
        // Riempi i dati GS1 solo se la scan ne porta (non azzerarli su re-scan).
        ...gs1Cols,
      });
      return { status: 'matched', lineId: existing.id, productName: match.product.name, suggestions: [] };
    }
    const lineId = await repo.insertLine({
      receipt_id: input.receiptId,
      product_id: match.product.id,
      raw_product_name: match.product.name,
      sku: match.product.sku,
      barcode: code,
      qty_received: input.qty,
      unit: match.product.unit,
      lot_number: input.lotNumber || null,
      expiry_date: input.expiryDate || null,
      line_status: 'matched',
      sort_order: detail.lines.length,
      scanned_by: userId,
      scanned_at: now,
      ...gs1Cols,
    });
    return { status: 'matched', lineId, productName: match.product.name, suggestions: [] };
  }

  // Codice non riconosciuto: riga pending con il codice, scelta manuale in UI.
  const lineId = await repo.insertLine({
    receipt_id: input.receiptId,
    raw_product_name: `Codice ${code}`,
    barcode: code,
    qty_received: input.qty,
    unit: 'pz',
    lot_number: input.lotNumber || null,
    expiry_date: input.expiryDate || null,
    line_status: 'pending',
    sort_order: detail.lines.length,
    scanned_by: userId,
    scanned_at: now,
    ...gs1Cols,
  });
  return {
    status: 'unmatched',
    lineId,
    productName: null,
    suggestions: suggestProducts(catalog, code, 5),
  };
}

export async function addManualLine(raw: unknown): Promise<string> {
  const orgId = await requireOrgId();
  const userId = await requireUserId();
  const input = addLineSchema.parse(raw);

  const receipt = await repo.getReceiptRow(input.receiptId);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');
  assertOpen(receipt.status);

  // P1-E: l'incompatibilità di unità emerge QUANDO la riga nasce, non al
  // completamento (quando il corriere è già andato via).
  if (input.productId) {
    const catalog = await repo.listCatalogRefs(orgId);
    const product = catalog.find((p) => p.id === input.productId);
    if (product && unitConversionFactor(input.unit, product.unit) === null) {
      throw new BusinessRuleError(
        `Unità incompatibili: "${product.name}" è a magazzino in ${product.unit}, la riga è in ${input.unit}. ` +
        `Usa ${product.unit} (o un'unità convertibile) per questa riga.`,
      );
    }
  }

  const detail = await repo.getReceiptDetail(input.receiptId);
  return repo.insertLine({
    receipt_id: input.receiptId,
    product_id: input.productId || null,
    raw_product_name: input.rawProductName,
    sku: input.sku || null,
    barcode: input.barcode ? normalizeBarcode(input.barcode) : null,
    qty_expected: input.qtyExpected ?? null,
    qty_received: input.qtyReceived,
    unit: input.unit,
    lot_number: input.lotNumber || null,
    expiry_date: input.expiryDate || null,
    line_status: input.productId ? 'matched' : 'pending',
    sort_order: detail.lines.length,
    scanned_by: input.viaScan ? userId : null,
    scanned_at: input.viaScan ? new Date().toISOString() : null,
  });
}

export async function updateLine(raw: unknown): Promise<void> {
  const orgId = await requireOrgId();
  const userId = await requireUserId();
  const input = updateLineSchema.parse(raw);

  const line = await repo.getLineById(input.lineId);
  const receipt = await repo.getReceiptRow(line.receipt_id);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');
  assertOpen(receipt.status);

  if (input.qtyReceived !== undefined && input.qtyReceived < Number(line.qty_posted)) {
    throw new BusinessRuleError(
      `Quantità già contabilizzata a magazzino: ${line.qty_posted}. Per correggere al ribasso usa una rettifica di magazzino.`,
    );
  }

  await repo.patchLine(input.lineId, {
    qty_received: input.qtyReceived,
    lot_number: input.lotNumber === undefined ? undefined : input.lotNumber || null,
    expiry_date: input.expiryDate === undefined ? undefined : input.expiryDate || null,
    discrepancy_reason:
      input.discrepancyReason === undefined ? undefined : input.discrepancyReason || null,
    line_status: input.discrepancyReason ? 'discrepancy' : undefined,
    scanned_by: input.viaScan ? userId : undefined,
    scanned_at: input.viaScan ? new Date().toISOString() : undefined,
  });
}

/** Associa manualmente una riga non riconosciuta a un prodotto del catalogo. */
export async function resolveLineProduct(raw: unknown): Promise<void> {
  const orgId = await requireOrgId();
  const input = resolveLineProductSchema.parse(raw);

  const line = await repo.getLineById(input.lineId);
  const receipt = await repo.getReceiptRow(line.receipt_id);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');
  assertOpen(receipt.status);

  const catalog = await repo.listCatalogRefs(orgId);
  const product = catalog.find((p) => p.id === input.productId);
  if (!product) throw new NotFoundError('Prodotto');

  if (Number(line.qty_posted) > 0) {
    throw new BusinessRuleError(
      'Questa riga ha già quantità contabilizzate a magazzino: non può cambiare prodotto o unità. Usa una rettifica.',
    );
  }

  // UNITÀ: la riga passa all'unità del prodotto SOLO convertendo le quantità.
  // Non convertibile → errore esplicito (mai "2 pz" che diventano "2 kg").
  const lineUnit = line.unit as UnitOfMeasure;
  const factor = unitConversionFactor(lineUnit, product.unit);
  if (factor === null) {
    throw new BusinessRuleError(
      `Unità incompatibili: la riga è in ${lineUnit}, il prodotto "${product.name}" è in ${product.unit}. ` +
      `Azzera la quantità di questa riga e aggiungine una manuale in ${product.unit}, oppure scegli un altro prodotto.`,
    );
  }

  await repo.patchLine(input.lineId, {
    product_id: product.id,
    unit: product.unit,
    qty_received: convertQty(Number(line.qty_received), lineUnit, product.unit) ?? Number(line.qty_received),
    qty_expected:
      line.qty_expected === null ? null : convertQty(Number(line.qty_expected), lineUnit, product.unit),
    line_status: 'matched',
  });

  // Apprendimento barcode: se la riga ha un codice e il prodotto non ne ha uno,
  // salvalo sul prodotto (i prossimi scan matchano da soli).
  if (line.barcode && !product.barcode) {
    const supabase = await createClient<Database>();
    const { error } = await supabase
      .from('ingredient_products')
      .update({ barcode: line.barcode })
      .eq('id', product.id)
      .is('barcode', null);
    if (error) {
      console.error('[goods-receipts] salvataggio barcode su prodotto fallito', error);
    }
  }
}

/** Crea il prodotto al volo dal nome riga e lo associa (riusa il catalog service). */
export async function createProductFromLine(raw: unknown): Promise<void> {
  const orgId = await requireOrgId();
  const input = createProductFromLineSchema.parse(raw);

  const line = await repo.getLineById(input.lineId);
  const receipt = await repo.getReceiptRow(line.receipt_id);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');
  assertOpen(receipt.status);

  if (Number(line.qty_posted) > 0) {
    throw new BusinessRuleError(
      'Questa riga ha già quantità contabilizzate a magazzino: non può cambiare prodotto o unità. Usa una rettifica.',
    );
  }

  // UNITÀ: il nuovo prodotto nasce in input.unit e la riga vi si aggancia —
  // le quantità della riga vanno convertite, o l'unità scelta è incompatibile.
  const lineUnit = line.unit as UnitOfMeasure;
  const qtyReceivedConv = convertQty(Number(line.qty_received), lineUnit, input.unit);
  if (qtyReceivedConv === null) {
    throw new BusinessRuleError(
      `Unità incompatibili: la riga è in ${lineUnit} ma stai creando il prodotto in ${input.unit}. ` +
      `Crea il prodotto in ${lineUnit}, oppure azzera la riga e aggiungine una manuale in ${input.unit}.`,
    );
  }

  const created = await createIngredient({
    name: input.name,
    sku: input.sku ?? '',
    unit: input.unit,
    supplierId: receipt.supplier_id ?? '',
    unitPrice: '',
    notes: 'Creato dal ricevimento merce.',
  });

  const barcode = input.barcode ? normalizeBarcode(input.barcode) : line.barcode;
  if (barcode) {
    const supabase = await createClient<Database>();
    const { error } = await supabase
      .from('ingredient_products')
      .update({ barcode })
      .eq('id', created.id);
    if (error) console.error('[goods-receipts] set barcode su nuovo prodotto fallito', error);
  }

  await repo.patchLine(input.lineId, {
    product_id: created.id,
    raw_product_name: input.name,
    unit: input.unit,
    qty_received: qtyReceivedConv,
    qty_expected:
      line.qty_expected === null ? null : convertQty(Number(line.qty_expected), lineUnit, input.unit),
    line_status: 'matched',
  });
}

// ---------------------------------------------------------------------------
// Completamento / annullamento
// ---------------------------------------------------------------------------

/** Contabilizza il ricevimento (RPC transazionale). Ritorna lo stato finale. */
export async function completeReceipt(id: string): Promise<ReceiptStatus> {
  const orgId = await requireOrgId();
  const receipt = await repo.getReceiptRow(id);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');
  assertOpen(receipt.status);

  const detail = await repo.getReceiptDetail(id);
  const toPost = detail.lines.filter((l) => l.qtyReceived > l.qtyPosted);
  if (toPost.length === 0) {
    throw new BusinessRuleError('Nessuna quantità ricevuta da contabilizzare.');
  }
  const unmatched = toPost.filter((l) => !l.productId);
  if (unmatched.length > 0) {
    throw new BusinessRuleError(
      `${unmatched.length} rig${unmatched.length === 1 ? 'a' : 'he'} senza prodotto associato (${unmatched
        .map((l) => l.rawProductName)
        .slice(0, 3)
        .join(', ')}…): risolvi il matching prima di completare.`,
    );
  }

  const supabase = await createClient<Database>();
  const { data, error } = await supabase.rpc('complete_purchase_receipt', { p_receipt_id: id });
  if (error) throw mapSupabaseError(error);
  return data as ReceiptStatus;
}

/**
 * "Ricevuto tutto" in un tap (caso standard "il fornitore ha consegnato tutto"):
 * imposta qty_received = qty_expected su ogni riga MATCHATA non ancora piena, poi
 * completa riusando completeReceipt (stessi movimenti/idempotenza). Le righe non
 * associate a un prodotto restano fuori → il ricevimento resta 'partial' (nessun
 * blocco). Evita all'utente di compilare a mano ogni riga quando è tutto arrivato.
 */
export async function receiveAllAndComplete(id: string): Promise<ReceiptStatus> {
  const orgId = await requireOrgId();
  const receipt = await repo.getReceiptRow(id);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');
  assertOpen(receipt.status);

  const detail = await repo.getReceiptDetail(id);
  const toFill = detail.lines.filter(
    (l) => l.productId && l.qtyExpected !== null && l.qtyReceived < (l.qtyExpected ?? 0),
  );
  for (const l of toFill) {
    await repo.patchLine(l.id, { qty_received: l.qtyExpected ?? 0, line_status: 'received' });
  }
  return completeReceipt(id);
}

/**
 * SPRINT 1 MOBILE — "Ricevuto" in un tap dalla lista ordini: ricezione TOTALE
 * (o del residuo, su ordini parziali) componendo ESCLUSIVAMENTE l'engine
 * esistente: createReceipt prefillato dall'ordine → receiveAllAndComplete →
 * RPC complete_purchase_receipt. Nessun nuovo write-path di stock; se esiste
 * già un ricevimento aperto collegato all'ordine viene riusato (niente doppioni).
 */
export async function receiveOrderInFull(orderId: string): Promise<ReceiptStatus> {
  const orgId = await requireOrgId();

  const existing = await repo.findOpenReceiptIdForOrder(orgId, orderId);
  if (existing) return receiveAllAndComplete(existing);

  // Fornitore dall'ordine (createReceipt valida stato/org ma non backfilla il supplier).
  const supabase = await createClient<Database>();
  const { data: order, error } = await supabase
    .from('purchase_orders')
    .select('id, organization_id, supplier_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!order || order.organization_id !== orgId) throw new NotFoundError('Ordine');

  const receiptId = await createReceipt({
    mode: 'bakery',
    supplierId: order.supplier_id ?? '',
    purchaseOrderId: orderId,
  });
  return receiveAllAndComplete(receiptId);
}

/**
 * P1-B — pulizia liste: i draft VUOTI (zero righe) più vecchi di 7 giorni
 * vengono archiviati (status 'cancelled': nessun ledger toccato, sono gusci).
 * Best-effort e idempotente: la chiama l'indice ricevimenti al caricamento.
 */
export async function archiveStaleDraftReceipts(maxAgeDays = 7): Promise<number> {
  const orgId = await requireOrgId();
  const drafts = await repo.listReceipts(orgId, { status: ['draft'] });
  const cutoff = Date.now() - maxAgeDays * 24 * 3600_000;
  const stale = drafts.filter((r) => r.linesCount === 0 && new Date(r.createdAt).getTime() < cutoff);
  for (const r of stale) {
    await repo.patchReceipt(r.id, { status: 'cancelled' });
  }
  return stale.length;
}

export async function cancelReceipt(id: string): Promise<void> {
  const orgId = await requireOrgId();
  const receipt = await repo.getReceiptRow(id);
  if (receipt.organization_id !== orgId) throw new NotFoundError('Ricevimento');

  if (receipt.status === 'completed' || receipt.status === 'cancelled') {
    throw new BusinessRuleError(`Il ricevimento è già ${receipt.status}.`);
  }
  const detail = await repo.getReceiptDetail(id);
  if (detail.lines.some((l) => l.qtyPosted > 0)) {
    throw new BusinessRuleError(
      'Sono già stati registrati carichi a magazzino: il ricevimento non può essere annullato. Usa una rettifica.',
    );
  }
  await repo.patchReceipt(id, { status: 'cancelled' });
}

// ---------------------------------------------------------------------------
// Supporto wizard
// ---------------------------------------------------------------------------

export interface ReceivableOrder {
  id: string;
  supplierId: string | null;
  supplierName: string;
  orderDate: string;
  status: string;
  linesCount: number;
}

/** Ordini collegabili a un ricevimento (inviati/confermati, non ricevuti). */
export async function listReceivableOrders(): Promise<ReceivableOrder[]> {
  const orgId = await requireOrgId();
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, supplier_id, order_date, status, suppliers(name)')
    .eq('organization_id', orgId)
    .in('status', ['sent', 'confirmed', 'partial'])
    .order('order_date', { ascending: false })
    .limit(50)
    .returns<{
      id: string;
      supplier_id: string | null;
      order_date: string;
      status: string;
      suppliers: { name: string } | null;
    }[]>();
  if (error) throw mapSupabaseError(error);

  const ids = (data ?? []).map((o) => o.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: lines, error: linesErr } = await supabase
      .from('order_line_items')
      .select('purchase_order_id')
      .in('purchase_order_id', ids);
    if (linesErr) throw mapSupabaseError(linesErr);
    for (const l of lines ?? []) {
      counts.set(l.purchase_order_id, (counts.get(l.purchase_order_id) ?? 0) + 1);
    }
  }

  return (data ?? []).map((o) => ({
    id: o.id,
    supplierId: o.supplier_id,
    supplierName: o.suppliers?.name ?? '—',
    orderDate: o.order_date,
    status: o.status,
    linesCount: counts.get(o.id) ?? 0,
  }));
}

export interface SupplierOption {
  id: string;
  name: string;
  type: 'bakeryos_connected' | 'external_supplier';
}

export async function listSupplierOptions(): Promise<SupplierOption[]> {
  const orgId = await requireOrgId();
  const supabase = await createClient<Database>();
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, supplier_org_id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name');
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.supplier_org_id ? 'bakeryos_connected' : 'external_supplier',
  }));
}

/** Catalogo per la selezione manuale prodotto in UI. */
export async function listCatalogForPicker(): Promise<CatalogProductRef[]> {
  const orgId = await requireOrgId();
  return repo.listCatalogRefs(orgId);
}

// Garantisce che requireSession resti l'unico punto di verità per i ruoli
// quando in futuro serviranno gate più fini (es. rettifiche solo owner).
export { requireSession };
