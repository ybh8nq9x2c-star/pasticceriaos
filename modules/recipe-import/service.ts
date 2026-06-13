// =============================================================================
// modules/recipe-import/service.ts
// Business logic dell'import massivo ricette.
//   analyzeRecipeImport() → parse (puro) + match catalogo → preview
//   importRecipes()       → commit batch RIUSANDO catalog.createRecipe /
//                           catalog.createIngredient (nessun nuovo write-path).
// Nessuna persistenza intermedia, nessuna nuova tabella.
// =============================================================================

import { requireOrgId } from '@/modules/identity/service';
import { listIngredients, createIngredient, createRecipe } from '@/modules/catalog/service';
import { extractPdfText } from '@/modules/goods-receipts/pdf-text';
import {
  AUTO_MATCH_THRESHOLD,
  matchProduct,
  normalizeName,
  suggestProducts,
  type CatalogProductRef,
} from '@/modules/goods-receipts/matching';
import { BusinessRuleError, getErrorMessage } from '@/lib/errors';
import { parseCsv, parseText } from './parse';
import { importRecipesSchema, type ImportRecipesInput } from './schemas';
import type { AnalyzeResult, ImportSourceKind, ImportSummary, ParsedRecipe } from './types';

async function catalogRefs(): Promise<CatalogProductRef[]> {
  const ingredients = await listIngredients(true);
  // L'import ricette matcha solo per NOME: barcode/sku non rilevanti qui.
  return ingredients.map((i) => ({ id: i.id, name: i.name, sku: i.sku ?? null, barcode: null, unit: i.unit }));
}

export interface AnalyzeArgs {
  kind: ImportSourceKind;
  text?: string;
  file?: File;
}

export async function analyzeRecipeImport(args: AnalyzeArgs): Promise<AnalyzeResult> {
  await requireOrgId(); // garantisce sessione + contesto org (catalogo RLS-scoped)
  const warnings: string[] = [];
  let recipes: ParsedRecipe[];

  if (args.kind === 'pdf') {
    if (!args.file) throw new BusinessRuleError('Nessun PDF caricato.');
    const text = await extractPdfText(args.file);
    recipes = parseText(text);
    if (recipes.length === 0) {
      warnings.push(
        'Nessuna ricetta riconosciuta nel PDF. Verifica che contenga testo (non una scansione) oppure incolla il testo manualmente.',
      );
    }
  } else if (args.kind === 'csv') {
    const text = args.text ?? (args.file ? await args.file.text() : '');
    if (!text.trim()) throw new BusinessRuleError('Il CSV è vuoto.');
    recipes = parseCsv(text);
    if (recipes.length === 0) {
      // Forse non è davvero tabellare: prova come testo libero.
      recipes = parseText(text);
      if (recipes.length === 0) {
        warnings.push('CSV non riconosciuto: servono almeno una colonna ingrediente e una quantità.');
      }
    }
  } else {
    const text = args.text ?? '';
    if (!text.trim()) throw new BusinessRuleError('Incolla del testo da analizzare.');
    recipes = parseText(text);
    if (recipes.length === 0) warnings.push('Nessuna ricetta riconosciuta nel testo incollato.');
  }

  // Arricchimento con il match sul catalogo dell'organizzazione.
  const catalog = await catalogRefs();
  for (const r of recipes) {
    for (const line of r.ingredients) {
      const m = matchProduct(catalog, { name: line.name });
      if (m && m.confidence >= AUTO_MATCH_THRESHOLD) {
        line.matchedProductId = m.product.id;
        line.matchedProductName = m.product.name;
        if (!line.unit) line.unit = m.product.unit; // eredita l'unità dal catalogo se mancante
      } else {
        line.suggestions = suggestProducts(catalog, line.name, 5).map((s) => ({
          id: s.product.id,
          name: s.product.name,
          unit: s.product.unit,
          confidence: s.confidence,
        }));
      }
    }
  }

  return { source: args.kind, recipes, warnings };
}

export async function importRecipes(raw: unknown): Promise<ImportSummary> {
  await requireOrgId();
  const input: ImportRecipesInput = importRecipesSchema.parse(raw);

  const summary: ImportSummary = { createdRecipes: 0, createdIngredients: 0, skipped: [] };
  // Dedup degli ingredienti creati in questo batch (stesso nome → un solo prodotto).
  const createdByName = new Map<string, string>();

  for (const recipe of input.recipes) {
    try {
      const resolved: { ingredientProductId: string; quantity: string; unit: (typeof recipe.ingredients)[number]['unit']; sortOrder: number }[] = [];

      for (let i = 0; i < recipe.ingredients.length; i++) {
        const ing = recipe.ingredients[i];
        let productId = ing.productId ?? null;

        if (!productId && ing.createName) {
          const key = normalizeName(ing.createName);
          productId = createdByName.get(key) ?? null;
          if (!productId) {
            const created = await createIngredient({ name: ing.createName, unit: ing.unit });
            productId = created.id;
            createdByName.set(key, productId);
            summary.createdIngredients++;
          }
        }

        if (!productId) continue; // riga non risolvibile → saltata (difesa, lo schema la blocca)
        resolved.push({ ingredientProductId: productId, quantity: String(ing.quantity), unit: ing.unit, sortOrder: i });
      }

      if (resolved.length === 0) {
        summary.skipped.push({ name: recipe.name, reason: 'Nessun ingrediente valido.' });
        continue;
      }

      await createRecipe({
        name: recipe.name,
        basePortions: recipe.basePortions,
        category: recipe.category ?? '',
        notes: recipe.notes ?? '',
        sellPricePerPortion: null,
        ingredients: resolved,
      });
      summary.createdRecipes++;
    } catch (err) {
      summary.skipped.push({ name: recipe.name, reason: getErrorMessage(err) });
    }
  }

  return summary;
}
