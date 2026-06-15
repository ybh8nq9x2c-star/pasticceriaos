// =============================================================================
// modules/inventory/schemas.ts
// Zod schemas per inventory movements e threshold update.
// =============================================================================

import { z } from 'zod';

const MOVEMENT_TYPES = [
  'purchase_receipt',
  'production_usage',
  'waste',
  'manual_adjustment',
  'initial_stock',
  'return_to_supplier',
] as const;

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

// ---------------------------------------------------------------------------
// Registra un movimento di magazzino manuale
// ---------------------------------------------------------------------------

export const createMovementSchema = z
  .object({
    ingredientProductId: z.string().uuid('ID ingrediente non valido'),
    movementType: z.enum(MOVEMENT_TYPES, {
      errorMap: () => ({ message: 'Tipo movimento non valido' }),
    }),
    quantityDelta: z
      .string()
      .transform((v) => parseFloat(v.replace(',', '.')))
      .pipe(z.number().refine((n) => n !== 0, { message: 'La quantità non può essere 0' })),
    unit: z.enum(UNITS),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
    referenceType: z.string().trim().max(50).nullish().or(z.literal('')),
    referenceId:   z.string().uuid().nullish().or(z.literal('')),
  })
  .refine(
    (data) =>
      data.movementType !== 'manual_adjustment' ||
      (data.notes && data.notes.trim().length > 0),
    {
      message: 'Le note sono obbligatorie per gli aggiustamenti manuali',
      path: ['notes'],
    },
  );

// ---------------------------------------------------------------------------
// Aggiorna soglia minima per un ingrediente
// ---------------------------------------------------------------------------

export const updateThresholdSchema = z.object({
  ingredientProductId: z.string().uuid(),
  minThreshold: z
    .string()
    .transform((v) => parseFloat(v.replace(',', '.')))
    .pipe(z.number().min(0, 'La soglia non può essere negativa')),
});

// ---------------------------------------------------------------------------
// Rettifica al conteggio reale: porta lo stock ESATTAMENTE al valore contato.
// Il delta firmato viene calcolato server-side (manual_adjustment).
// ---------------------------------------------------------------------------

export const adjustStockSchema = z.object({
  ingredientProductId: z.string().uuid('ID ingrediente non valido'),
  countedQuantity: z
    .string()
    .transform((v) => parseFloat(v.replace(',', '.')))
    .pipe(z.number().min(0, 'Il conteggio non può essere negativo')),
  unit: z.enum(UNITS),
});

// ---------------------------------------------------------------------------
// Carico iniziale: shortcut per initial_stock movement
// ---------------------------------------------------------------------------

export const initialStockSchema = z.object({
  ingredientProductId: z.string().uuid('ID ingrediente non valido'),
  quantity: z
    .string()
    .transform((v) => parseFloat(v.replace(',', '.')))
    .pipe(z.number().positive('La quantità deve essere maggiore di 0')),
  unit: z.enum(UNITS),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Registrazione lotto ingrediente (alla ricezione ordine)
// ---------------------------------------------------------------------------

export const createBatchSchema = z.object({
  ingredientProductId: z.string().uuid('ID ingrediente non valido'),
  purchaseOrderId: z.string().uuid().nullish().or(z.literal('')),
  // nullish: difesa in profondità — il form non espone questi campi e
  // formData.get() può produrre null a monte (root cause BUG-02).
  lotNumber: z.string().trim().max(100).nullish().or(z.literal('')),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data scadenza non valida'),
  quantity: z
    .string()
    .transform((v) => parseFloat(v.replace(',', '.')))
    .pipe(z.number().positive('La quantità deve essere maggiore di 0')),
  unit: z.enum(UNITS),
  notes: z.string().trim().max(500).nullish().or(z.literal('')),
});

export type CreateMovementInput  = z.infer<typeof createMovementSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type AdjustStockInput     = z.infer<typeof adjustStockSchema>;
export type InitialStockInput    = z.infer<typeof initialStockSchema>;
export type CreateBatchInput     = z.infer<typeof createBatchSchema>;
