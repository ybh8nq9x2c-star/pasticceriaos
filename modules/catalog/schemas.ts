// =============================================================================
// modules/catalog/schemas.ts
// Zod schemas per catalog: suppliers, ingredient_products, recipes.
// =============================================================================

import { z } from 'zod';

const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'] as const;

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(200),
  email: z
    .string()
    .trim()
    .email('Email non valida')
    .toLowerCase(),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// IngredientProduct
// ---------------------------------------------------------------------------

export const createIngredientSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(200),
  sku: z.string().trim().max(50).optional().or(z.literal('')),
  unit: z.enum(UNITS, { errorMap: () => ({ message: 'Unità di misura non valida' }) }),
  supplierId: z.string().uuid().nullish().or(z.literal('')),
  unitPrice: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v.replace(',', '.')) : null))
    .pipe(z.number().min(0, 'Il prezzo non può essere negativo').nullable()),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const updateIngredientSchema = createIngredientSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Assegnazione massiva di un fornitore a più ingredienti (colma i "buchi").
export const assignSupplierBulkSchema = z.object({
  ingredientIds: z.array(z.string().uuid()).min(1, 'Seleziona almeno un ingrediente'),
  supplierId: z.string().uuid('Fornitore non valido'),
});

// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------

const recipeIngredientLineSchema = z.object({
  ingredientProductId: z.string().uuid('ID ingrediente non valido'),
  quantity: z
    .string()
    .transform((v) => parseFloat(v.replace(',', '.')))
    .pipe(z.number().positive('La quantità deve essere maggiore di 0')),
  unit: z.enum(UNITS),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

export const createRecipeSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(200),
  category: z.string().trim().max(100).optional().or(z.literal('')),
  emoji: z.string().trim().max(10).optional().or(z.literal('')),
  basePortions: z.coerce
    .number()
    .int('Le porzioni devono essere un numero intero')
    .positive('Le porzioni devono essere maggiori di 0'),
  sellPricePerPortion: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (s === '') return null;
      return parseFloat(s.replace(',', '.'));
    })
    .pipe(z.number().min(0, 'Il prezzo di vendita non può essere negativo').nullable()),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  ingredients: z
    .array(recipeIngredientLineSchema)
    .min(1, 'Aggiungi almeno un ingrediente'),
});

export const updateRecipeSchema = createRecipeSchema.omit({ ingredients: true }).partial().extend({
  ingredients: z.array(recipeIngredientLineSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type CreateSupplierInput    = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput    = z.infer<typeof updateSupplierSchema>;
export type CreateIngredientInput  = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput  = z.infer<typeof updateIngredientSchema>;
export type AssignSupplierBulkInput = z.infer<typeof assignSupplierBulkSchema>;
export type CreateRecipeInput      = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput      = z.infer<typeof updateRecipeSchema>;
