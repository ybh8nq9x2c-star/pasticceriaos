// =============================================================================
// modules/sales/schemas.ts
// Validazione input (manuale/mock = seam di ingestione V1) + link prodotto.
// =============================================================================

import { z } from 'zod';

export const manualSaleLineSchema = z.object({
  externalProductRef: z.string().trim().min(1, 'Prodotto obbligatorio'),
  productName: z.string().trim().min(1).optional(),
  quantity: z.coerce.number().positive('La quantità deve essere positiva'),
  unitPrice: z.coerce.number().min(0).optional().nullable(),
  recipeId: z.string().uuid().optional().nullable(),
  externalLineId: z.string().trim().min(1).optional().nullable(),
});

export const manualSaleSchema = z.object({
  externalSaleId: z.string().trim().min(1, 'ID scontrino obbligatorio'),
  source: z.string().trim().min(1).default('manual'),
  soldAt: z.string().trim().min(1).optional(), // ISO; default = now nel service
  totalAmount: z.coerce.number().min(0).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  lines: z.array(manualSaleLineSchema).min(1, 'Almeno una riga'),
});

export type ManualSaleInput = z.infer<typeof manualSaleSchema>;

export const reverseSaleSchema = z.object({
  saleId: z.string().uuid(),
});
