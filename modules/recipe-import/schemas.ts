// =============================================================================
// modules/recipe-import/schemas.ts
// Zod del payload di COMMIT (ricette confermate dall'utente in preview).
// Ogni riga ingrediente è già "risolta": o punta a un prodotto esistente
// (productId) o chiede la creazione di un nuovo ingrediente (createName).
// =============================================================================

import { z } from 'zod';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

const importIngredientSchema = z
  .object({
    quantity: z
      .union([z.string(), z.number()])
      .transform((v) => parseFloat(String(v).replace(',', '.')))
      .pipe(z.number().positive('La quantità deve essere maggiore di 0')),
    unit: z.enum(UNITS),
    productId: z.string().uuid().nullish(),
    createName: z.string().trim().max(200).nullish(),
  })
  .refine((d) => !!d.productId || !!(d.createName && d.createName.length >= 1), {
    message: 'Ingrediente non risolto: associa un prodotto o indica un nome da creare.',
  });

const importRecipeSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(200),
  basePortions: z.coerce
    .number()
    .int('Le porzioni devono essere un numero intero')
    .positive('Le porzioni devono essere maggiori di 0'),
  category: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  ingredients: z.array(importIngredientSchema).min(1, 'Ogni ricetta richiede almeno un ingrediente'),
});

export const importRecipesSchema = z.object({
  recipes: z.array(importRecipeSchema).min(1, 'Seleziona almeno una ricetta da importare'),
});

export type ImportRecipesInput = z.infer<typeof importRecipesSchema>;
