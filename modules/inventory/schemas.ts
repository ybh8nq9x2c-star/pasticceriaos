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

export type CreateMovementInput  = z.infer<typeof createMovementSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type InitialStockInput    = z.infer<typeof initialStockSchema>;
