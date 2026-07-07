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

/**
 * Config POS self-service (wizard /sales/pos). Serve ALMENO uno tra store_id e
 * merchant_code: è ciò che permette al webhook di risolvere l'organizzazione.
 */
export const savePosConfigSchema = z
  .object({
    provider: z.string().trim().min(1).default('mipos'),
    storeId: z.string().trim().max(120).optional().or(z.literal('')),
    merchantCode: z.string().trim().max(120).optional().or(z.literal('')),
    isActive: z.coerce.boolean().default(true),
  })
  .refine((v) => Boolean(v.storeId?.trim() || v.merchantCode?.trim()), {
    message: 'Inserisci lo Store ID oppure il Merchant code (li trovi nel pannello della cassa).',
    path: ['storeId'],
  });

export type SavePosConfigInput = z.infer<typeof savePosConfigSchema>;
