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
import { parseCsv, parseCsvWithMapping, parseText, inspectCsv } from './parse';
import { isAiImportAvailable, aiUnderstandImport } from './ai/provider';
import { adaptAiRecipes, adaptAiMapping } from './ai/adapter';
import { importRecipesSchema, type ImportRecipesInput } from './schemas';
import type {
  AnalyzeResult,
  ImportSourceKind,
  ImportSummary,
  ParsedRecipe,
  ResolvedMapping,
} from './types';

async function catalogRefs(): Promise<CatalogProductRef[]> {
  const ingredients = await listIngredients(true);
  // L'import ricette matcha solo per NOME: barcode/sku non rilevanti qui.
  return ingredients.map((i) => ({ id: i.id, name: i.name, sku: i.sku ?? null, barcode: null, unit: i.unit }));
}

export interface AnalyzeArgs {
  kind: ImportSourceKind;
  text?: string;
  file?: File;
  /** Mappatura colonne risolta dall'utente (solo CSV, preview-layer). */
  mapping?: ResolvedMapping;
  /** L'utente ha scelto l'assistenza AI (toggle UI). Default false. */
  aiAssist?: boolean;
}

/** L'AI è disponibile per la UI? (espone la presenza della API key, non il valore). */
export function isRecipeAiAvailable(): boolean {
  return isAiImportAvailable();
}

export async function analyzeRecipeImport(args: AnalyzeArgs): Promise<AnalyzeResult> {
  await requireOrgId(); // garantisce sessione + contesto org (catalogo RLS-scoped)
  const warnings: string[] = [];
  let recipes: ParsedRecipe[];
  let sourceText = ''; // testo grezzo, riusato dall'eventuale rescue AI
  let aiAssisted = false;
  // L'AI parte solo se l'utente l'ha scelta E una key è configurata.
  const willTryAi = Boolean(args.aiAssist) && isAiImportAvailable();

  if (args.kind === 'pdf') {
    if (!args.file) throw new BusinessRuleError('Nessun PDF caricato.');
    sourceText = await extractPdfText(args.file);
    recipes = parseText(sourceText);
    if (recipes.length === 0) {
      warnings.push(
        'Nessuna ricetta riconosciuta nel PDF. Verifica che contenga testo (non una scansione) oppure incolla il testo manualmente.',
      );
    }
  } else if (args.kind === 'csv') {
    sourceText = args.text ?? (args.file ? await args.file.text() : '');
    if (!sourceText.trim()) throw new BusinessRuleError('Il CSV è vuoto.');
    if (args.mapping) {
      // Mappatura confermata dall'utente: il parser usa esattamente quella.
      recipes = parseCsvWithMapping(sourceText, args.mapping.fields, args.mapping.hasHeader);
      if (recipes.length === 0) {
        warnings.push(
          'Con questa mappatura non risultano righe valide: assicurati di aver indicato la colonna dell’ingrediente.',
        );
      }
    } else {
      recipes = parseCsv(sourceText);
      if (recipes.length === 0) {
        // Forse non è davvero tabellare: prova come testo libero.
        recipes = parseText(sourceText);
        if (recipes.length === 0 && !willTryAi) {
          warnings.push(
            'Non ho riconosciuto le colonne del file. Servono almeno una colonna con gli ingredienti e una con le quantità. Se esporti da Excel, salva come CSV (UTF-8). In alternativa, incolla le righe come testo.',
          );
        }
      }
    }
  } else {
    sourceText = args.text ?? '';
    if (!sourceText.trim()) throw new BusinessRuleError('Incolla del testo da analizzare.');
    recipes = parseText(sourceText);
    if (recipes.length === 0 && !willTryAi) {
      warnings.push('Nessuna ricetta riconosciuta nel testo incollato.');
    }
  }

  // Catalogo dell'organizzazione (serve sia all'AI per gli hint, sia al match a valle).
  const catalog = await catalogRefs();

  // ── Rescue AI-assistito (Phase AI-1) ────────────────────────────────────────
  // Interviene SOLO quando il parser deterministico non ha trovato nulla e una
  // API key è configurata. L'AI CAPISCE (mappatura colonne / estrazione da testo
  // rumoroso); l'ESTRAZIONE finale resta deterministica dove possibile (CSV →
  // parseCsvWithMapping su tutto il file). Output sempre convertito in candidati
  // preview-layer, mai auto-confermato. Qualunque problema → resta il fallback.
  if (recipes.length === 0 && sourceText.trim() && willTryAi && !args.mapping) {
    const ai = await aiUnderstandImport({
      kind: args.kind,
      text: args.kind === 'csv' ? undefined : sourceText,
      columns: args.kind === 'csv' ? inspectCsv(sourceText).columns.map((c) => ({ header: c.header, samples: c.sample })) : undefined,
      catalogNames: catalog.map((c) => c.name),
    });
    if (ai) {
      const mapping = args.kind === 'csv' ? adaptAiMapping(ai) : null;
      if (mapping) {
        // CSV: l'AI ha mappato le colonne → estrazione deterministica del file intero.
        recipes = parseCsvWithMapping(sourceText, mapping.fields, mapping.hasHeader);
      }
      if (recipes.length === 0) {
        // Testo/PDF (o CSV senza mapping affidabile) → candidati dall'AI.
        recipes = adaptAiRecipes(ai);
      }
      if (recipes.length > 0) {
        aiAssisted = true;
      } else {
        warnings.push('Non sono riuscito a riconoscere ricette in questo file, nemmeno con l’assistenza AI.');
      }
    } else {
      warnings.push('Assistenza AI non disponibile in questo momento. Prova a incollare il testo o a salvare il file come CSV.');
    }
  }

  // Arricchimento con il match sul catalogo dell'organizzazione (vale anche per i
  // candidati prodotti dall'AI: i suggerimenti restano deterministici e verificati).
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

  return { source: args.kind, recipes, warnings, aiAssisted };
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
