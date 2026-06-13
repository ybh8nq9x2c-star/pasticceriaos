// =============================================================================
// modules/goods-receipts/schemas.ts
// Zod al confine actions→service. Tutti i campi testuali sono nullish-safe
// (pattern formField: un campo assente nel form arriva come undefined).
// =============================================================================

import { z } from 'zod';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

const qty = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : parseFloat(v.replace(',', '.'))))
  .pipe(z.number().min(0, 'La quantità non può essere negativa').max(1_000_000, 'Quantità fuori range'));

const optionalText = (max: number) => z.string().trim().max(max).nullish().or(z.literal(''));

export const createReceiptSchema = z.object({
  mode: z.enum(['supplier', 'bakery']),
  supplierId: z.string().uuid('Fornitore non valido').nullish().or(z.literal('')),
  purchaseOrderId: z.string().uuid().nullish().or(z.literal('')),
  ddtNumber: optionalText(50),
  ddtDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('')),
  notes: optionalText(2000),
});

export const importDdtSchema = z.object({
  mode: z.enum(['supplier', 'bakery']),
  supplierId: z.string().uuid('Fornitore non valido').nullish().or(z.literal('')),
});

export const addLineSchema = z.object({
  receiptId: z.string().uuid(),
  productId: z.string().uuid().nullish().or(z.literal('')),
  rawProductName: z.string().trim().min(1, 'Il nome prodotto è obbligatorio').max(200),
  barcode: optionalText(64),
  sku: optionalText(50),
  qtyExpected: qty.nullish().or(z.literal('').transform(() => null)),
  qtyReceived: qty.optional().default(0),
  unit: z.enum(UNITS),
  lotNumber: optionalText(100),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('')),
  viaScan: z.coerce.boolean().optional().default(false),
});

export const updateLineSchema = z.object({
  lineId: z.string().uuid(),
  qtyReceived: qty.optional(),
  lotNumber: optionalText(100),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('')),
  discrepancyReason: optionalText(500),
  viaScan: z.coerce.boolean().optional().default(false),
});

export const resolveLineProductSchema = z.object({
  lineId: z.string().uuid(),
  productId: z.string().uuid('Prodotto non valido'),
});

export const scanSchema = z.object({
  receiptId: z.string().uuid(),
  code: z.string().trim().min(3, 'Codice troppo corto').max(64),
  qty: qty.optional().default(1),
  lotNumber: optionalText(100),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('')),
});

export const createProductFromLineSchema = z.object({
  lineId: z.string().uuid(),
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(200),
  unit: z.enum(UNITS),
  barcode: optionalText(64),
  sku: optionalText(50),
});

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type ImportDdtInput = z.infer<typeof importDdtSchema>;
export type AddLineInput = z.infer<typeof addLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
export type ScanInput = z.infer<typeof scanSchema>;
