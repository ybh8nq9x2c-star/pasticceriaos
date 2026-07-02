// =============================================================================
// modules/sales/types.ts
// Tipi dominio vendite. CanonicalSale = forma NORMALIZZATA indipendente dalla
// sorgente (webhook POS, import CSV, inserimento manuale).
//
// DOMINIO (050): la vendita scala i PRODOTTI FINITI (finished_goods_movements),
// MAI le materie prime — quelle le consuma il completamento produzione. Il BOM
// non appartiene più al flusso vendita.
// =============================================================================

export type SaleLineStatus = 'deducted' | 'unlinked' | 'no_bom' | 'unit_mismatch';
export type SaleStatus = 'processed' | 'partially_linked' | 'unlinked';

/** Stato vendita aggregato dagli stati riga. 'processed' solo se TUTTO dedotto. */
export function aggregateSaleStatus(lineStatuses: SaleLineStatus[]): SaleStatus {
  if (lineStatuses.length === 0) return 'unlinked';
  const deducted = lineStatuses.filter((s) => s === 'deducted').length;
  if (deducted === lineStatuses.length) return 'processed';
  if (deducted > 0) return 'partially_linked';
  return 'unlinked';
}

export interface CanonicalSaleLine {
  externalLineId?: string | null;
  externalProductRef: string; // codice/nome prodotto dal POS
  productName: string;
  quantity: number;
  unitPrice?: number | null;
  recipeId?: string | null; // se la sorgente ha già risolto la ricetta
}

export interface CanonicalSale {
  externalSaleId: string;
  source: string;
  soldAt: string; // ISO
  totalAmount?: number | null;
  customerId?: string | null;
  notes?: string | null;
  lines: CanonicalSaleLine[];
}

export interface IngestSummary {
  saleId: string;
  status: SaleStatus;
  linesTotal: number;
  linesDeducted: number;
  linesNeedingAttention: number; // unlinked + no_bom + unit_mismatch
  movementsCreated: number;
}

// ── Viste di lettura per la UI ────────────────────────────────────────────────

export interface SaleView {
  id: string;
  externalSaleId: string;
  source: string;
  soldAt: string;
  status: string;
  totalAmount: number | null;
  lineCount: number;
}

export interface SaleLineView {
  id: string;
  externalProductRef: string;
  productName: string;
  recipeId: string | null;
  recipeName: string | null; // ricetta (BOM) da cui è stato dedotto — null = non collegato
  quantity: number;
  status: SaleLineStatus;
  exception: string | null;
}

/** Prodotto POS visto in vendita ma non collegato a una ricetta (alert admin). */
export interface UnlinkedProduct {
  source: string;
  externalProductRef: string;
  productName: string;
  occurrences: number;
}
