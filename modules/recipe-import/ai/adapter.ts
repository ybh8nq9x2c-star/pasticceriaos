// =============================================================================
// modules/recipe-import/ai/adapter.ts
// PURO (no DB, no rete): converte l'output dell'AI in dati PREVIEW-LAYER
// (ParsedRecipe[] / ResolvedMapping). Regole di sicurezza:
//   • niente invenzioni: un campo sotto soglia di confidenza NON viene pre-
//     compilato come certo → resta null/vuoto + warning → l'utente lo conferma;
//   • unità solo canoniche (le altre → null, da confermare);
//   • il commit resta validato dagli schemi stretti: questo livello produce solo
//     candidati editabili in preview.
// =============================================================================

import type { ParsedRecipe, ParsedIngredientLine, ResolvedMapping } from '../types';
import { AI_UNITS, type AiImportResult } from './contract';

/** Sopra questa confidenza pre-compiliamo il valore; sotto, lo segnaliamo. */
const ACCEPT = 0.6;

const CANON = new Set<string>(AI_UNITS);

function acceptedUnit(unit: string | null, conf: number): ParsedIngredientLine['unit'] {
  if (!unit || conf < ACCEPT) return null;
  return CANON.has(unit) ? (unit as ParsedIngredientLine['unit']) : null;
}

/**
 * AI result → ParsedRecipe[] (gli stessi candidati che produce il parser
 * deterministico). I `suggestions`/`matchedProductId` restano vuoti: il matcher
 * di catalogo del service gira a valle su questi candidati, come per il parser.
 */
export function adaptAiRecipes(ai: AiImportResult): ParsedRecipe[] {
  return ai.recipes.map((r, i) => {
    const warnings: string[] = [...(r.ambiguityFlags ?? [])];

    let name = r.name?.trim() ?? '';
    if (!name || r.nameConfidence < ACCEPT) {
      // Nome provvisorio ESPLICITO (non un'invenzione spacciata per certa).
      if (name && r.nameConfidence < ACCEPT) {
        warnings.push(`Nome ricetta incerto ("${name}"): conferma o correggi.`);
      } else {
        name = `Ricetta ${i + 1}`;
        warnings.push('Nome ricetta non rilevato: assegnato un nome provvisorio, rinominala.');
      }
    }

    const ingredients: ParsedIngredientLine[] = r.ingredients.map((ing) => {
      const ingName = ing.name?.trim() || ing.rawText?.trim() || '';
      if (ingName && ing.nameConfidence < ACCEPT) {
        warnings.push(`Ingrediente incerto ("${ingName}"): verifica il nome.`);
      }
      const quantity = ing.quantity != null && ing.quantityConfidence >= ACCEPT ? ing.quantity : null;
      if (ing.quantity != null && ing.quantityConfidence < ACCEPT) {
        warnings.push(`Quantità incerta per "${ingName}": inseriscila a mano.`);
      }
      const unit = acceptedUnit(ing.unit, ing.unitConfidence);
      if (ing.unit && !unit) {
        warnings.push(`Unità ambigua per "${ingName}": confermala.`);
      }
      return {
        rawText: ing.rawText?.trim() || ingName,
        name: ingName,
        quantity,
        unit,
        matchedProductId: null,
        matchedProductName: null,
        suggestions: [],
      };
    });

    return {
      name,
      basePortions: r.portions ?? null,
      category: r.category?.trim() || null,
      notes: r.notes?.trim() || null,
      ingredients,
      // Dedup dei warning (l'AI può ripetere lo stesso flag).
      warnings: [...new Set(warnings)],
    };
  });
}

/**
 * AI columnMapping → ResolvedMapping (pre-compila la UI di mapping del Phase 2).
 * Restituisce null se l'AI non è abbastanza sicura: in tal caso resta l'auto-
 * detect deterministico + la conferma manuale dell'utente.
 */
export function adaptAiMapping(ai: AiImportResult, minConfidence = ACCEPT): ResolvedMapping | null {
  const m = ai.columnMapping;
  if (!m || m.confidence < minConfidence || m.fields.length === 0) return null;
  if (!m.fields.includes('ingredient')) return null; // ingrediente è il minimo
  return { fields: [...m.fields], hasHeader: m.hasHeader };
}

/** Riepilogo "trovate N · M pronte · K da confermare" calcolabile lato UI. */
export function aiReadinessSummary(recipes: ParsedRecipe[]): {
  total: number;
  needConfirmation: number;
} {
  const needConfirmation = recipes.filter(
    (r) => r.warnings.length > 0 || r.ingredients.some((l) => l.quantity === null),
  ).length;
  return { total: recipes.length, needConfirmation };
}
