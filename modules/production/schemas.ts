// =============================================================================
// modules/production/schemas.ts
// Zod schemas per production plans.
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Plan Item
// ---------------------------------------------------------------------------

const planItemSchema = z.object({
  recipeId:   z.string().uuid('ID ricetta non valido'),
  batchCount: z.coerce
    .number()
    .int('Il numero di batch deve essere intero')
    .positive('Il numero di batch deve essere maggiore di 0'),
  notes:     z.string().trim().max(500).nullish().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// Create Production Plan
// ---------------------------------------------------------------------------

export const createPlanSchema = z.object({
  planDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida (YYYY-MM-DD)'),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  items: z
    .array(planItemSchema)
    .min(1, 'Aggiungi almeno una ricetta al piano'),
});

// ---------------------------------------------------------------------------
// Update Production Plan (header only; items replaced separately)
// ---------------------------------------------------------------------------

export const updatePlanSchema = z.object({
  planDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida')
    .optional(),
  notes:  z.string().trim().max(1000).optional().or(z.literal('')),
  status: z.enum(['draft', 'in_progress', 'completed', 'cancelled']).optional(),
  items:  z.array(planItemSchema).min(1).optional(),
});

// ---------------------------------------------------------------------------
// Add Single Item to Draft Plan
// ---------------------------------------------------------------------------

export const addPlanItemSchema = planItemSchema;

export type CreatePlanInput   = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput   = z.infer<typeof updatePlanSchema>;
export type AddPlanItemInput  = z.infer<typeof addPlanItemSchema>;
export type PlanItemInput     = z.infer<typeof planItemSchema>;
