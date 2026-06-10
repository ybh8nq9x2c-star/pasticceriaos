// =============================================================================
// modules/customers/schemas.ts
// =============================================================================

import { z } from 'zod';

const STATUSES = ['pending', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled'] as const;

const itemSchema = z.object({
  recipeId: z.string().uuid().nullish().or(z.literal('')),
  description: z.string().trim().min(1, 'Descrizione obbligatoria').max(300),
  quantity: z.coerce.number().int('Quantità intera').positive('Quantità > 0'),
  unitPrice: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (s === '') return null;
      return parseFloat(s.replace(',', '.'));
    })
    .pipe(z.number().min(0).nullable()),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export const createCustomerOrderSchema = z.object({
  customerName: z.string().trim().min(1, 'Nome cliente obbligatorio').max(200),
  customerPhone: z.string().trim().max(50).optional().or(z.literal('')),
  customerEmail: z.string().trim().email('Email non valida').optional().or(z.literal('')),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data ritiro non valida'),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  depositPaid: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (s === '') return null;
      return parseFloat(s.replace(',', '.'));
    })
    .pipe(z.number().min(0).nullable()),
  items: z.array(itemSchema).min(1, 'Aggiungi almeno un articolo'),
});

export const changeCustomerOrderStatusSchema = z.object({
  status: z.enum(STATUSES),
});

export type CustomerOrderItemInput = z.infer<typeof itemSchema>;
export type CreateCustomerOrderInput = z.infer<typeof createCustomerOrderSchema>;
