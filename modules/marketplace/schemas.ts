// =============================================================================
// modules/marketplace/schemas.ts
// Zod validation at every marketplace boundary (actions -> service).
// =============================================================================

import { z } from 'zod';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

export const generateKeySchema = z.object({
  label: z.string().trim().max(120).optional().or(z.literal('')),
});

export const connectSupplierSchema = z.object({
  // human-shareable key, e.g. PSOS-XXXX-XXXX-XXXX (case/space-insensitive)
  key: z.string().trim().min(8, 'Chiave non valida').max(64),
});

export const revokeKeySchema = z.object({ keyId: z.string().uuid() });
export const revokeConnectionSchema = z.object({ connectionId: z.string().uuid() });

export const catalogItemSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(200),
  // nullish: difesa in profondità — formData.get() può produrre null a monte.
  sku: z.string().trim().max(50).nullish().or(z.literal('')),
  unit: z.enum(UNITS, { errorMap: () => ({ message: 'Unità non valida' }) }),
  unitPrice: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v.replace(',', '.')) : null))
    .pipe(z.number().min(0, 'Prezzo non valido').nullable()),
});

const orderLineSchema = z.object({
  catalogItemId: z.string().uuid('Prodotto non valido'),
  quantity: z
    .string()
    .transform((v) => parseFloat(v.replace(',', '.')))
    .pipe(z.number().positive('La quantità deve essere maggiore di 0')),
});

export const createOrderSchema = z.object({
  connectionId: z.string().uuid('Fornitore non valido'),
  notes: z.string().trim().max(2000).nullish().or(z.literal('')),
  lines: z.array(orderLineSchema).min(1, 'Aggiungi almeno un prodotto'),
  idempotencyKey: z.string().trim().max(120).nullish().or(z.literal('')),
});

export const changeStatusSchema = z.object({
  orderId: z.string().uuid(),
  toStatus: z.enum([
    'draft', 'submitted', 'accepted', 'in_preparation', 'shipped', 'delivered', 'cancelled',
  ]),
  note: z.string().trim().max(500).nullish().or(z.literal('')),
});

export type GenerateKeyInput = z.infer<typeof generateKeySchema>;
export type ConnectSupplierInput = z.infer<typeof connectSupplierSchema>;
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
