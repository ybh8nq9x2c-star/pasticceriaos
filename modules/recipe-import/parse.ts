// =============================================================================
// modules/recipe-import/parse.ts
// Parser EURISTICI e PURI (nessun DB, nessun side-effect, nessuna AI). Tutto
// deterministico e testabile: data un input, produce ricette candidate. Le
// ambiguità non bloccano — vengono segnalate come warning e risolte in preview.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';
import type { ParsedIngredientLine, ParsedRecipe } from './types';

const UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'];

// Sinonimi → unità canonica. Tutto ciò che non è qui resta `null` (da confermare).
const UNIT_SYNONYMS: Record<string, UnitOfMeasure> = {
  g: 'g', gr: 'g', grammo: 'g', grammi: 'g',
  kg: 'kg', kilo: 'kg', kili: 'kg', chilo: 'kg', chili: 'kg', chilogrammi: 'kg', kilogrammi: 'kg',
  ml: 'ml', millilitri: 'ml', millilitro: 'ml',
  l: 'l', lt: 'l', litro: 'l', litri: 'l',
  pz: 'pz', pezzo: 'pz', pezzi: 'pz', pc: 'pz', pcs: 'pz', n: 'pz', unita: 'pz',
  bustina: 'bustina', bustine: 'bustina', bst: 'bustina',
  foglio: 'foglio', fogli: 'foglio', fg: 'foglio',
};

function stripDiacriticsLower(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Normalizza un token unità a una UnitOfMeasure, o null se sconosciuta/ambigua. */
export function normalizeUnit(raw: string | null | undefined): UnitOfMeasure | null {
  if (!raw) return null;
  const key = stripDiacriticsLower(raw.trim()).replace(/\.$/, '');
  return UNIT_SYNONYMS[key] ?? null;
}

/** "1,5" → 1.5 · "1/2" → 0.5 · "" → null. Conservativo: una sola quantità positiva. */
export function parseQuantity(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(',', '.');
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d ? Number(frac[1]) / d : null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const LIST_PREFIX = /^\s*(?:[-*•·–—]|\d+[.)])\s*/;
const QTY = String.raw`(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)`;

/**
 * Riconosce una riga ingrediente. Ritorna name/quantity/unit, oppure null se la
 * riga NON è un ingrediente (titolo, istruzione, sottotitolo…). Regola chiave:
 * senza una quantità riconoscibile NON la classifichiamo come ingrediente
 * (evita di trasformare istruzioni in ingredienti fantasma).
 */
export function parseIngredientLine(
  rawLine: string,
): { name: string; quantity: number | null; unit: UnitOfMeasure | null } | null {
  const line = rawLine.replace(LIST_PREFIX, '').trim();
  if (!line || !/\d/.test(line)) return null;

  // Pattern A — quantità in testa: "500 g farina", "2 uova", "1/2 kg burro"
  const a = line.match(new RegExp(`^${QTY}\\s*([\\p{L}.]+)?\\s+(?:di\\s+)?(.{2,})$`, 'u'));
  if (a) {
    const quantity = parseQuantity(a[1]);
    const unit = normalizeUnit(a[2]);
    // Se il token dopo la quantità non è un'unità, fa parte del nome ("2 uova").
    const name = unit ? a[3] : `${a[2] ? a[2] + ' ' : ''}${a[3]}`;
    if (quantity !== null) return { name: cleanName(name), quantity, unit };
  }

  // Pattern B — quantità in coda: "Farina 00: 500 g", "Uova 3", "Burro - 250 g"
  const b = line.match(new RegExp(`^(.{2,}?)[\\s:,–-]+${QTY}\\s*([\\p{L}.]+)?\\.?$`, 'u'));
  if (b) {
    const quantity = parseQuantity(b[2]);
    if (quantity !== null) {
      return { name: cleanName(b[1]), quantity, unit: normalizeUnit(b[3]) };
    }
  }

  return null;
}

function cleanName(s: string): string {
  return s.replace(/[\s:.,;–-]+$/, '').replace(/^[\s:.,;–-]+/, '').trim();
}

function cleanTitle(s: string): string {
  const t = s
    .replace(LIST_PREFIX, '')
    .replace(/^\s*#+\s*/, '')
    .replace(/^(ricetta|recipe)\s*[:.\-]?\s*/i, '')
    // togli un'eventuale resa tra parentesi a fine titolo: "Tiramisù (8 porzioni)"
    .replace(/\s*\(\s*\d+[^)]*\)\s*$/, '');
  return cleanName(t);
}

const HEADER_LINE = /^(ingredienti|ingredients|procedimento|preparazione|istruzioni|preparation)\s*:?\s*$/i;

/**
 * Riconosce porzioni/resa da una riga, o null. CONSERVATIVO: il numero deve
 * essere legato a una parola "porzioni/persone/pezzi" o a "resa/dosi", così
 * "cuoci per 8 minuti" NON viene scambiato per una resa.
 */
export function parsePortions(line: string): number | null {
  const paren = line.match(/\((\d{1,4})\s*(?:porzion\w*|pezz\w*|person\w*|pz|p\.)\)/i);
  if (paren) return clampPortions(Number(paren[1]));
  const after = line.match(/(\d{1,4})\s*(?:porzion\w*|person\w*)\b/i);
  if (after) return clampPortions(Number(after[1]));
  const resa = line.match(/\b(?:resa|dos[ei])\s*[:=]?\s*(\d{1,4})\b/i);
  if (resa) return clampPortions(Number(resa[1]));
  return null;
}

function clampPortions(n: number): number | null {
  return Number.isInteger(n) && n > 0 && n <= 9999 ? n : null;
}

/** Porzioni da una cella CSV: prima un intero nudo ("4"), poi il parser testuale ("4 porzioni"). */
function parsePortionsCell(raw: string | undefined): number | null {
  const bare = clampPortions(Number((raw ?? '').trim()));
  return bare ?? parsePortions(raw ?? '');
}

function toLine(
  ing: NonNullable<ReturnType<typeof parseIngredientLine>>,
  raw: string,
): ParsedIngredientLine {
  return {
    rawText: raw.trim(),
    name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit,
    matchedProductId: null,
    matchedProductName: null,
    suggestions: [],
  };
}

/**
 * Parser TESTO/PDF: blocchi separati da righe vuote. Un blocco con ≥1 riga
 * ingrediente è una ricetta; il titolo è la prima riga non-ingrediente (non
 * header) del blocco, oppure un titolo isolato nel blocco precedente.
 */
export function parseText(input: string): ParsedRecipe[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) blocks.push(cur), (cur = []);
    } else cur.push(l);
  }
  if (cur.length) blocks.push(cur);

  const recipes: ParsedRecipe[] = [];
  let pendingTitle: string | null = null;

  for (const block of blocks) {
    const ingredients: ParsedIngredientLine[] = [];
    const nonIngredient: string[] = [];
    for (const raw of block) {
      const ing = parseIngredientLine(raw);
      if (ing) ingredients.push(toLine(ing, raw));
      else nonIngredient.push(raw.trim());
    }

    if (ingredients.length === 0) {
      // Blocco senza ingredienti: se è corto, è probabilmente il titolo del
      // blocco successivo (titolo separato dagli ingredienti da una riga vuota).
      const first = nonIngredient.find((l) => l);
      if (block.length <= 2 && first) pendingTitle = cleanTitle(first);
      continue;
    }

    // Porzioni: primo match tra le righe non-ingrediente.
    let portions: number | null = null;
    for (const l of nonIngredient) {
      const p = parsePortions(l);
      if (p !== null) {
        portions = p;
        break;
      }
    }

    // Titolo + note: scarta le righe header ("Ingredienti:").
    const titleCandidates = nonIngredient.filter((l) => l && !HEADER_LINE.test(l));
    let name: string;
    let noteLines: string[];
    if (pendingTitle) {
      name = pendingTitle;
      noteLines = titleCandidates;
    } else {
      name = titleCandidates.length ? cleanTitle(titleCandidates[0]) : '';
      noteLines = titleCandidates.slice(1);
    }
    pendingTitle = null;
    // Le note non devono ripetere la dichiarazione di resa.
    noteLines = noteLines.filter((l) => parsePortions(l) === null);

    const warnings: string[] = [];
    if (!name) {
      name = `Ricetta ${recipes.length + 1}`;
      warnings.push('Nome non rilevato: assegnato un nome provvisorio, rinominala.');
    }
    if (portions === null) warnings.push('Porzioni non rilevate: impostate a 1, correggile se serve.');
    addAmbiguityWarnings(ingredients, warnings);

    recipes.push({
      name,
      basePortions: portions,
      category: null,
      notes: noteLines.length ? noteLines.join(' · ') : null,
      ingredients,
      warnings,
    });
  }

  return recipes;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let max = -1;
  for (const d of candidates) {
    const n = headerLine.split(d).length;
    if (n > max) (max = n), (best = d);
  }
  return best;
}

/** CSV minimale RFC4180-ish: gestisce virgolette e delimitatore variabile. */
function parseCsvRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const text = input.replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') (field += '"'), i++;
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) (row.push(field), (field = ''));
    else if (c === '\n') (row.push(field), rows.push(row), (row = []), (field = ''));
    else field += c;
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row));
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

type ColRole = 'recipe' | 'ingredient' | 'quantity' | 'unit' | 'portions' | 'category' | 'notes';

function headerRole(cell: string): ColRole | null {
  const h = stripDiacriticsLower(cell.trim());
  if (/ricett|recipe|dolce|preparazion/.test(h)) return 'recipe';
  if (/ingredient|materia|prodotto/.test(h)) return 'ingredient';
  if (/quantit|qta|qty|dose|peso/.test(h)) return 'quantity';
  if (/unit|misura|^um$|\bum\b/.test(h)) return 'unit';
  if (/porzion|resa|dosi|pezzi/.test(h)) return 'portions';
  if (/categor|tipo/.test(h)) return 'category';
  if (/note|notes/.test(h)) return 'notes';
  if (h === 'nome' || h === 'name') return 'ingredient'; // ambiguo → ingrediente
  return null;
}

/**
 * Parser CSV: una riga = un ingrediente; raggruppa per colonna ricetta (se
 * presente), altrimenti tutto in un'unica ricetta da rinominare.
 */
export function parseCsv(input: string): ParsedRecipe[] {
  const firstLine = input.replace(/\r\n?/g, '\n').split('\n').find((l) => l.trim()) ?? '';
  const delimiter = detectDelimiter(firstLine);
  const rows = parseCsvRows(input, delimiter);
  if (rows.length < 2) return [];

  const header = rows[0];
  const roles = header.map(headerRole);
  const col = (role: ColRole) => roles.indexOf(role);
  const iRecipe = col('recipe');
  const iIngredient = col('ingredient');
  const iQty = col('quantity');
  const iUnit = col('unit');
  const iPortions = col('portions');
  const iCategory = col('category');
  const iNotes = col('notes');

  // Senza colonne minime riconoscibili non procediamo (fallback gestito a monte).
  if (iIngredient < 0 && iRecipe < 0) return [];

  const groups = new Map<string, ParsedRecipe>();

  for (const row of rows.slice(1)) {
    const recipeName = (iRecipe >= 0 ? row[iRecipe] : '')?.trim() || 'Ricetta importata';
    const ingName = cleanName((iIngredient >= 0 ? row[iIngredient] : '') ?? '');
    if (!ingName) continue; // riga senza ingrediente → saltata

    let recipe = groups.get(recipeName);
    if (!recipe) {
      recipe = {
        name: recipeName,
        basePortions: iPortions >= 0 ? parsePortionsCell(row[iPortions]) : null,
        category: iCategory >= 0 ? row[iCategory]?.trim() || null : null,
        notes: iNotes >= 0 ? row[iNotes]?.trim() || null : null,
        ingredients: [],
        warnings: [],
      };
      if (recipeName === 'Ricetta importata') {
        recipe.warnings.push('Nome ricetta non presente nel CSV: rinominala prima di importare.');
      }
      groups.set(recipeName, recipe);
    }

    recipe.ingredients.push({
      rawText: row.join(' | '),
      name: ingName,
      quantity: iQty >= 0 ? parseQuantity(row[iQty]) : null,
      unit: iUnit >= 0 ? normalizeUnit(row[iUnit]) : null,
      matchedProductId: null,
      matchedProductName: null,
      suggestions: [],
    });
  }

  const recipes = [...groups.values()];
  for (const r of recipes) {
    if (r.basePortions === null) r.warnings.push('Porzioni non presenti: impostate a 1, correggile se serve.');
    addAmbiguityWarnings(r.ingredients, r.warnings);
  }
  return recipes;
}

/** Avvisi non bloccanti su unità/quantità mancanti e ingredienti duplicati. */
function addAmbiguityWarnings(lines: ParsedIngredientLine[], warnings: string[]): void {
  if (lines.some((l) => l.quantity === null)) warnings.push('Alcune quantità non sono state riconosciute.');
  if (lines.some((l) => l.unit === null)) warnings.push('Alcune unità sono ambigue o mancanti: confermale.');
  const seen = new Set<string>();
  for (const l of lines) {
    const k = stripDiacriticsLower(l.name);
    if (seen.has(k)) {
      warnings.push(`Ingrediente duplicato: "${l.name}".`);
      break;
    }
    seen.add(k);
  }
}

export { UNITS };
