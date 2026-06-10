// =============================================================================
// modules/catalog/types.ts
// Tipi dominio: prodotti, fornitori, ricette.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

export interface Supplier {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface IngredientProduct {
  id: string;
  organizationId: string;
  supplierId: string | null;
  supplierName: string | null; // join da suppliers
  name: string;
  sku: string | null;
  unit: UnitOfMeasure;
  unitPrice: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  ingredientProductId: string;
  ingredientName: string; // join da ingredient_products
  quantity: number;
  unit: UnitOfMeasure;
  sortOrder: number;
}

export interface Recipe {
  id: string;
  organizationId: string;
  name: string;
  category: string | null;
  emoji: string | null;
  basePortions: number;
  sellPricePerPortion: number | null;
  notes: string | null;
  isActive: boolean;
  ingredients: RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeListItem {
  id: string;
  name: string;
  category: string | null;
  emoji: string | null;
  basePortions: number;
  isActive: boolean;
  ingredientsCount: number;
  createdAt: string;
}
