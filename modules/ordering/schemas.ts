// =============================================================================
// modules/ordering/schemas.ts
// Zod schemas per purchase orders.
// =============================================================================

import { z } from 'zod';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;
const ORDER_STATUSES = ['draft', 'sent', 'confirmed', 'received', 'cancelled'] as const;

// ---------------------------------------------------------------------------
// Line Item
// ---------------------------------------------------------------------------

const lineItemSchema = z.object({
  ingredientProductId: z.string().uuid('ID ingrediente non valido'),
  quantity: z
    .string()
    .transform((v) => parseFloat(v.replace(',', '.')))
    .pipe(z.number().positive('La quantità deve essere maggiore di 0')),
  unitSnapshot: z.enum(UNITS),
  unitPriceSnapshot: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v.replace(',', '.')) : null))
    .pipe(z.number().min(0).nullable()),
});

// ---------------------------------------------------------------------------
// Create Order
// ---------------------------------------------------------------------------

export const createOrderSchema = z.object({
  supplierId: z.string().uuid('Seleziona un fornitore valido'),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data ordine non valida'),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data attesa non valida')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  lineItems: z
    .array(lineItemSchema)
    .min(1, 'Aggiungi almeno un prodotto all\'ordine'),
});

// ---------------------------------------------------------------------------
// Update Order (solo in stato draft)
// ---------------------------------------------------------------------------

export const updateOrderSchema = z.object({
  supplierId: z.string().uuid().optional(),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  notes:     z.string().trim().max(2000).optional().or(z.literal('')),
  lineItems: z.array(lineItemSchema).min(1).optional(),
});

// ---------------------------------------------------------------------------
// Change Status
// ---------------------------------------------------------------------------

export const changeStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  notes:  z.string().trim().max(500).optional().or(z.literal('')),
});

export type CreateOrderInput  = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput  = z.infer<typeof updateOrderSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type LineItemInput     = z.infer<typeof lineItemSchema>;
