// =============================================================================
// modules/documents/types.ts
// Ciclo documentale passivo: DDT, fatture, conferme ordine, note credito.
// =============================================================================

import type {
  UnitOfMeasure,
  DocumentType,
  DocumentStatus,
  AnomalyType,
} from '@/lib/database.types';

export interface DocumentLine {
  id: string;
  orderLineItemId: string | null;
  ingredientProductId: string | null;
  description: string;
  quantity: number;
  unit: UnitOfMeasure;
  unitPrice: number | null;
  lineTotal: number | null;
  quantityVariance: number | null;
  priceVariance: number | null;
  matchedAt: string | null;
}

export interface DocumentAnomaly {
  id: string;
  anomalyType: AnomalyType;
  description: string;
  expectedValue: string | null;
  actualValue: string | null;
  resolved: boolean;
  resolvedAt: string | null;
}

export interface CommercialDocument {
  id: string;
  organizationId: string;
  supplierId: string | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  marketplaceOrderId: string | null;
  documentType: DocumentType;
  documentStatus: DocumentStatus;
  documentNumber: string | null;
  documentDate: string;
  dueDate: string | null;
  subtotalAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  notes: string | null;
  uploadedByOrgId: string | null;
  matchedAt: string | null;
  createdAt: string;
  lines: DocumentLine[];
  anomalies: DocumentAnomaly[];
}

export interface DocumentListItem {
  id: string;
  documentType: DocumentType;
  documentStatus: DocumentStatus;
  documentNumber: string | null;
  documentDate: string;
  totalAmount: number | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  openAnomalies: number;
  linesCount: number;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  order_confirmation: 'Conferma ordine',
  delivery_note: 'DDT',
  invoice: 'Fattura',
  credit_note: 'Nota di credito',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  received: 'Da verificare',
  matched: 'Verificato',
  anomaly: 'Anomalie',
  archived: 'Archiviato',
};

export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  quantity_mismatch: 'Differenza quantità',
  price_mismatch: 'Differenza prezzo',
  extra_item: 'Riga non ordinata',
  missing_item: 'Riga ordinata mancante',
  total_mismatch: 'Totale documento incoerente',
};
