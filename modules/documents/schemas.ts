// =============================================================================
// modules/documents/schemas.ts
// =============================================================================

import { z } from 'zod';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;
const DOC_TYPES = ['order_confirmation', 'delivery_note', 'invoice', 'credit_note'] as const;

const moneyField = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '') return null;
    return parseFloat(s.replace(',', '.'));
  })
  .pipe(z.number().min(0).nullable());

export const documentLineSchema = z.object({
  orderLineItemId: z.string().uuid().nullish().or(z.literal('')),
  ingredientProductId: z.string().uuid().nullish().or(z.literal('')),
  description: z.string().trim().min(1, 'Descrizione riga obbligatoria').max(300),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => parseFloat(String(v).replace(',', '.')))
    .pipe(z.number().positive('Quantità riga > 0')),
  unit: z.enum(UNITS),
  unitPrice: moneyField,
});

export const createDocumentSchema = z.object({
  supplierId: z.string().uuid('Seleziona un fornitore valido'),
  purchaseOrderId: z.string().uuid().nullish().or(z.literal('')),
  documentType: z.enum(DOC_TYPES),
  documentNumber: z.string().trim().max(100).optional().or(z.literal('')),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data documento non valida'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  totalAmount: moneyField,
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  lines: z.array(documentLineSchema).min(1, 'Aggiungi almeno una riga'),
});

export const supplierUploadSchema = z.object({
  marketplaceOrderId: z.string().uuid(),
  documentType: z.enum(['delivery_note', 'invoice']),
  documentNumber: z.string().trim().max(100).optional().or(z.literal('')),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data documento non valida'),
  totalAmount: moneyField,
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const resolveAnomalySchema = z.object({
  anomalyId: z.string().uuid(),
});

export type DocumentLineInput = z.infer<typeof documentLineSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type SupplierUploadInput = z.infer<typeof supplierUploadSchema>;
