// =============================================================================
// modules/pos/schemas.ts — validazione UI mappature POS (session-side).
// =============================================================================

import { z } from 'zod';

export const upsertPosMappingSchema = z.object({
  source: z.string().trim().min(1).default('pos:mipos'),
  posItemId: z.string().trim().min(1, 'Codice/PLU obbligatorio'),
  posItemName: z.string().trim().optional().nullable(),
  recipeId: z.string().uuid('Seleziona una ricetta'),
  portionsPerUnit: z.coerce.number().int('Numero intero').positive('Deve essere > 0').default(1),
});

export type UpsertPosMappingInput = z.infer<typeof upsertPosMappingSchema>;
