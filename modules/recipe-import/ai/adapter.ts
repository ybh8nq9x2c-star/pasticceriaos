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
import { AI_UNITS, type AiImportResult, type AiIngredient, type AiNormalizedRecipe } from './contract';

/** Sopra questa confidenza pre-compiliamo il valore; sotto, lo segnaliamo. */
const ACCEPT = 0.6;

const CANON = new Set<string>(AI_UNITS);

function acceptedUnit(unit: string | null, conf: number): ParsedIngredientLine['unit'] {
  if (!unit || conf < ACCEPT) return null;
  return CANON.has(unit) ? (unit as ParsedIngredientLine['unit']) : null;
}

/**
 * Una riga ingrediente AI → ParsedIngredientLine (preview-layer). Niente
 * invenzioni: valori sotto soglia restano null + warning. Condiviso da
 * adaptAiRecipes e dall'arricchimento per-chunk.
 */
function adaptAiIngredient(ing: AiIngredient, warnings: string[]): ParsedIngredientLine {
  const ingName = ing.name?.trim() || ing.rawText?.trim() || '';
  if (ingName && ing.nameConfidence < ACCEPT) warnings.push(`Ingrediente incerto ("${ingName}"): verifica il nome.`);
  const quantity = ing.quantity != null && ing.quantityConfidence >= ACCEPT ? ing.quantity : null;
  if (ing.quantity != null && ing.quantityConfidence < ACCEPT) warnings.push(`Quantità incerta per "${ingName}": inseriscila a mano.`);
  const unit = acceptedUnit(ing.unit, ing.unitConfidence);
  if (ing.unit && !unit) warnings.push(`Unità ambigua per "${ingName}": confermala.`);
  return {
    rawText: ing.rawText?.trim() || ingName,
    name: ingName,
    quantity,
    unit,
    matchedProductId: null,
    matchedProductName: null,
    suggestions: [],
  };
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

    const ingredients: ParsedIngredientLine[] = r.ingredients.map((ing) => adaptAiIngredient(ing, warnings));

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

/**
 * Quante righe ingrediente hanno una quantità popolata — proxy di "utilità": una
 * ricetta è "pronta" solo se ogni ingrediente ha una quantità. Usato per decidere
 * se i candidati AI (normalizzati) sono migliori dell'estrazione a colonne.
 */
export function quantityCoverage(recipes: ParsedRecipe[]): number {
  return recipes.reduce((n, r) => n + r.ingredients.filter((l) => l.quantity != null).length, 0);
}

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Arricchimento per-ricetta: per ogni ricetta del baseline (copertura piena), se
 * l'AI ha la STESSA ricetta (match per nome) con ingredienti meglio normalizzati
 * (più quantità), usa quelli. NESSUNA ricetta del baseline viene persa: l'AI
 * migliora, non sostituisce la copertura.
 */
export function enrichWithAi(baseline: ParsedRecipe[], aiNormalized: ParsedRecipe[]): ParsedRecipe[] {
  if (aiNormalized.length === 0) return baseline;
  const aiByName = new Map<string, ParsedRecipe>();
  for (const r of aiNormalized) {
    const k = normName(r.name);
    if (k && !aiByName.has(k)) aiByName.set(k, r);
  }
  return baseline.map((r) => {
    const match = aiByName.get(normName(r.name));
    if (match && quantityCoverage([match]) > quantityCoverage([r])) {
      return { ...r, ingredients: match.ingredients, warnings: [...new Set([...r.warnings, ...match.warnings])] };
    }
    return r;
  });
}

/**
 * @deprecated Merge a livello di INSIEME: sostituiva il baseline quando l'AI
 * restituiva ≥ ricette. Era il vettore del collasso 50→6 (un output AI troncato
 * a 6 rimpiazzava l'intero baseline). Sostituito da `enrichByIndex` (per-indice,
 * non sostituisce mai). Mantenuto solo per i test di unità esistenti.
 */
export function mergeAiIntoBaseline(baseline: ParsedRecipe[], aiNormalized: ParsedRecipe[]): ParsedRecipe[] {
  if (aiNormalized.length >= baseline.length) return aiNormalized.length > 0 ? aiNormalized : baseline;
  return enrichWithAi(baseline, aiNormalized);
}

// ── Arricchimento PER-INDICE (coverage-first) ─────────────────────────────────
// L'AI può solo AGGIUNGERE informazione a una ricetta baseline esistente: riempie
// i buchi (quantità/unità mancanti), pulisce un nome con numeri dentro, completa
// le porzioni. NON rimuove ricette, NON riduce le righe ingrediente, NON
// sovrascrive un valore già estratto in modo affidabile dal parser.

const GAP_WARNING_PREFIXES = ['Alcune quantità', 'Alcune unità', 'Da confermare', 'Porzioni non'];

function gapWarnings(lines: ParsedIngredientLine[]): string[] {
  const w: string[] = [];
  if (lines.some((l) => l.quantity === null)) w.push('Alcune quantità non sono state riconosciute.');
  if (lines.some((l) => l.unit === null)) w.push('Alcune unità sono ambigue o mancanti: confermale.');
  return w;
}

/** Arricchisce UNA ricetta baseline con la normalizzazione AI corrispondente. */
export function enrichRecipeByLine(base: ParsedRecipe, ai: AiNormalizedRecipe): ParsedRecipe {
  const aiWarnings: string[] = [...(ai.ambiguityFlags ?? [])];
  const adapted = ai.ingredients.map((ing) => adaptAiIngredient(ing, aiWarnings));

  const ingredients = base.ingredients.map((bl, j) => {
    const al = adapted[j];
    if (!al) return bl; // l'AI ha meno righe → tieni la riga baseline (niente perdita)
    const cleanerName = al.name && al.name.length > 1 && /\d/.test(bl.name) ? al.name : bl.name;
    return {
      ...bl,
      name: bl.name ? cleanerName : al.name || bl.name,
      quantity: bl.quantity ?? al.quantity, // riempi i buchi, non sovrascrivere
      unit: bl.unit ?? al.unit,
    };
  });

  const portions = base.basePortions ?? ai.portions ?? null;
  const kept = base.warnings.filter((w) => !GAP_WARNING_PREFIXES.some((p) => w.startsWith(p)));
  const warnings = [...new Set([...kept, ...gapWarnings(ingredients), ...aiWarnings])];
  return { ...base, basePortions: portions, ingredients, warnings };
}

/** Ricetta il cui chunk AI è fallito: resta intatta, ma flaggata "da confermare". */
export function markUnnormalized(base: ParsedRecipe): ParsedRecipe {
  const hasGap = base.ingredients.some((l) => l.quantity === null || l.unit === null);
  if (!hasGap || base.warnings.some((w) => w.startsWith('Da confermare'))) return base;
  return {
    ...base,
    warnings: [...base.warnings, 'Da confermare: normalizzazione automatica non riuscita, controlla quantità e unità.'],
  };
}

/**
 * Merge COVERAGE-FIRST per-indice. `byIndex` = normalizzazioni AI valide, chiave
 * = indice baseline. `failed` = indici i cui chunk sono falliti (→ "da
 * confermare"). GARANZIA: output.length === baseline.length, nessuna ricetta
 * persa, qualunque cosa l'AI restituisca (parziale, vuota, fuori ordine).
 */
export function enrichByIndex(
  baseline: ParsedRecipe[],
  byIndex: Map<number, AiNormalizedRecipe>,
  failed: ReadonlySet<number> = new Set(),
): ParsedRecipe[] {
  return baseline.map((r, i) => {
    const ai = byIndex.get(i);
    if (ai) return enrichRecipeByLine(r, ai);
    if (failed.has(i)) return markUnnormalized(r);
    return r;
  });
}
