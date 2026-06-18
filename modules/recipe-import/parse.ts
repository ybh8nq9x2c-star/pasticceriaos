// =============================================================================
// modules/recipe-import/parse.ts
// Parser EURISTICI e PURI (nessun DB, nessun side-effect, nessuna AI). Tutto
// deterministico e testabile: data un input, produce ricette candidate. Le
// ambiguità non bloccano — vengono segnalate come warning e risolte in preview.
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';
import type {
  ParsedIngredientLine,
  ParsedRecipe,
  ImportColumnField,
  CsvColumn,
  CsvInspection,
} from './types';

const UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'pz', 'bustina', 'foglio'];

// Sinonimi → unità canonica. Tutto ciò che non è qui resta `null` (da confermare).
const UNIT_SYNONYMS: Record<string, UnitOfMeasure> = {
  g: 'g', gr: 'g', grs: 'g', grammo: 'g', grammi: 'g',
  kg: 'kg', kilo: 'kg', kili: 'kg', chilo: 'kg', chili: 'kg', chilogrammo: 'kg', chilogrammi: 'kg', kilogrammi: 'kg',
  ml: 'ml', cc: 'ml', millilitri: 'ml', millilitro: 'ml',
  l: 'l', lt: 'l', litro: 'l', litri: 'l',
  pz: 'pz', pezzo: 'pz', pezzi: 'pz', pc: 'pz', pcs: 'pz', n: 'pz', nr: 'pz', unita: 'pz',
  bustina: 'bustina', bustine: 'bustina', busta: 'bustina', buste: 'bustina', bst: 'bustina',
  foglio: 'foglio', fogli: 'foglio', fg: 'foglio',
};

// Parole-misura comuni (cucchiaio, tazza…) che NON corrispondono a un'unità
// canonica: non possiamo convertirle senza distorcere, ma le riconosciamo per
// TOGLIERLE dal nome (così "2 cucchiai di zucchero" → "zucchero", non
// "cucchiai zucchero"). L'unità resta da confermare in preview. Elenco
// volutamente conservativo: niente termini ambigui ("noce", "foglia", "spicchio")
// che spesso fanno parte del nome reale dell'ingrediente.
const MEASURE_WORDS = new Set<string>([
  'cucchiaio', 'cucchiai', 'cucchiaino', 'cucchiaini', 'cucchiaiata', 'cucchiaiate',
  'tazza', 'tazze', 'tazzina', 'tazzine',
  'bicchiere', 'bicchieri', 'pizzico', 'pizzichi', 'manciata', 'manciate',
]);

// Frazioni unicode comuni nei testi incollati ("½ tazza", "1¾ kg").
const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};
const UNI_FRAC = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function stripDiacriticsLower(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Normalizza un token unità a una UnitOfMeasure, o null se sconosciuta/ambigua. */
export function normalizeUnit(raw: string | null | undefined): UnitOfMeasure | null {
  if (!raw) return null;
  const key = stripDiacriticsLower(raw.trim()).replace(/\.$/, '');
  return UNIT_SYNONYMS[key] ?? null;
}

/**
 * Quantità tollerante per la PREVIEW (il commit ri-valida in modo stretto via
 * zod). Riconosce: "1,5" → 1.5 · "1/2" → 0.5 · "1 1/2" → 1.5 · "½"/"1½" ·
 * intervalli "2-3" → estremo inferiore (2). Sempre una sola quantità positiva,
 * altrimenti null (da inserire a mano).
 */
export function parseQuantity(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(',', '.');
  if (!s) return null;

  // Intervallo "2-3" / "2–3": prendi l'estremo inferiore, l'utente affina dopo.
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*\d+(?:\.\d+)?$/);
  if (range) s = range[1];

  // Frazione unicode, eventualmente con intero davanti: "½", "1½".
  const uni = s.match(new RegExp(`^(\\d+)?\\s*([${UNI_FRAC}])$`));
  if (uni) {
    const v = (uni[1] ? Number(uni[1]) : 0) + (UNICODE_FRACTIONS[uni[2]] ?? 0);
    return v > 0 ? round3(v) : null;
  }

  // Numero misto "1 1/2".
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const d = Number(mixed[3]);
    const v = d ? Number(mixed[1]) + Number(mixed[2]) / d : NaN;
    return Number.isFinite(v) && v > 0 ? round3(v) : null;
  }

  // Frazione semplice "1/2".
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const d = Number(frac[2]);
    const v = d ? Number(frac[1]) / d : NaN;
    return Number.isFinite(v) && v > 0 ? round3(v) : null;
  }

  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const LIST_PREFIX = /^\s*(?:[-*•·–—]|\d+[.)])\s*/;
// QTY riconosce: intero/decimale, frazione "1/2", numero misto "1 1/2",
// frazione unicode "½" e intero+unicode "1½".
const QTY = `(\\d+\\s*[${UNI_FRAC}]|[${UNI_FRAC}]|(?:\\d+\\s+)?\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+)?)`;

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
  if (!line || !new RegExp(`[\\d${UNI_FRAC}]`).test(line)) return null;

  // Pattern A — quantità in testa: "500 g farina", "2 uova", "1/2 kg burro"
  const a = line.match(new RegExp(`^${QTY}\\s*([\\p{L}.]+)?\\s+(?:di\\s+)?(.{2,})$`, 'u'));
  if (a) {
    const quantity = parseQuantity(a[1]);
    const unit = normalizeUnit(a[2]);
    // a[2] = token tra quantità e nome. Se è un'unità canonica → unità. Se è una
    // parola-misura nota (cucchiaio, tazza…) la togliamo dal nome ma lasciamo
    // l'unità da confermare. Altrimenti fa parte del nome ("2 uova").
    const measureToken = a[2] ? stripDiacriticsLower(a[2]).replace(/\.$/, '') : '';
    const dropFromName = !!unit || MEASURE_WORDS.has(measureToken);
    const name = dropFromName ? a[3] : `${a[2] ? a[2] + ' ' : ''}${a[3]}`;
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
  // Sinonimi larghi e tolleranti: l'obiettivo è riconoscere intestazioni reali
  // da Excel/Google Sheets in italiano e inglese, anche abbreviate.
  if (/ricett|recipe|dolce|preparazion|titolo|piatto/.test(h)) return 'recipe';
  if (/ingredient|materia|prodotto|voce|componente|articolo|item/.test(h)) return 'ingredient';
  if (/quantit|q\.?ta|qty|dose|peso|amount|gramm/.test(h)) return 'quantity';
  if (/unit|misura|measure|^um$|\bum\b|udm|u\.?m/.test(h)) return 'unit';
  if (/porzion|resa|rese|dosi|pezzi|person|serv|yield/.test(h)) return 'portions';
  if (/categor|tipo|reparto|famiglia/.test(h)) return 'category';
  if (/note|notes|descriz|appunt|commento/.test(h)) return 'notes';
  if (h === 'nome' || h === 'name') return 'ingredient'; // ambiguo → ingrediente
  return null;
}

function roleToField(role: ColRole | null): ImportColumnField | null {
  switch (role) {
    case 'recipe':     return 'recipe';
    case 'ingredient': return 'ingredient';
    case 'quantity':   return 'quantity';
    case 'unit':       return 'unit';
    case 'portions':   return 'portions';
    case 'category':   return 'category';
    case 'notes':      return 'notes';
    default:           return null;
  }
}

interface ColIndex {
  recipe: number;
  ingredient: number;
  quantity: number;
  unit: number;
  portions: number;
  category: number;
  notes: number;
  allergens: number[];
}

function fieldsToColIndex(fields: ImportColumnField[]): ColIndex {
  const first = (f: ImportColumnField) => fields.indexOf(f);
  return {
    recipe: first('recipe'),
    ingredient: first('ingredient'),
    quantity: first('quantity'),
    unit: first('unit'),
    portions: first('portions'),
    category: first('category'),
    notes: first('notes'),
    allergens: fields.flatMap((f, i) => (f === 'allergens' ? [i] : [])),
  };
}

function csvRows(input: string): string[][] {
  const firstLine = input.replace(/\r\n?/g, '\n').split('\n').find((l) => l.trim()) ?? '';
  return parseCsvRows(input, detectDelimiter(firstLine));
}

/** Natura del contenuto di una colonna dai campioni (per i suggerimenti). */
function columnKind(samples: string[]): 'unit' | 'number' | 'text' | 'empty' {
  const nonEmpty = samples.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return 'empty';
  const units = nonEmpty.filter((s) => normalizeUnit(s) !== null).length;
  if (units / nonEmpty.length >= 0.5) return 'unit';
  const nums = nonEmpty.filter((s) => parseQuantity(s) !== null).length;
  if (nums / nonEmpty.length >= 0.5) return 'number';
  return 'text';
}

/**
 * Suggerimento di campo per colonna: prima i sinonimi dell'intestazione, poi il
 * contenuto (unità/numero), infine garantisce i due campi obbligatori se c'è una
 * colonna plausibile ancora libera. Tutto il resto resta 'ignore'.
 */
function suggestFields(header: string[], hasHeader: boolean, samplesByCol: string[][], ncol: number): ImportColumnField[] {
  const fields: (ImportColumnField | null)[] = [];
  for (let i = 0; i < ncol; i++) {
    fields.push(hasHeader ? roleToField(headerRole(header[i] ?? '')) : null);
  }
  for (let i = 0; i < ncol; i++) {
    if (fields[i]) continue;
    const kind = columnKind(samplesByCol[i] ?? []);
    if (kind === 'unit' && !fields.includes('unit')) fields[i] = 'unit';
    else if (kind === 'number' && !fields.includes('quantity')) fields[i] = 'quantity';
  }
  if (!fields.includes('ingredient')) {
    const i = fields.findIndex((f, j) => !f && columnKind(samplesByCol[j] ?? []) === 'text');
    if (i >= 0) fields[i] = 'ingredient';
  }
  if (!fields.includes('quantity')) {
    const i = fields.findIndex((f, j) => !f && columnKind(samplesByCol[j] ?? []) === 'number');
    if (i >= 0) fields[i] = 'quantity';
  }
  return fields.map((f) => f ?? 'ignore');
}

const SAMPLE_ROWS = 4;

/**
 * Ispeziona un CSV per il passo di MAPPING: colonne visibili, campioni,
 * abbinamento suggerito, presenza intestazione e "confidenza". Puro e
 * deterministico (gira anche client-side). `hasHeaderOverride` forza
 * l'interpretazione della prima riga (toggle utente).
 */
export function inspectCsv(input: string, hasHeaderOverride?: boolean): CsvInspection {
  const firstLine = input.replace(/\r\n?/g, '\n').split('\n').find((l) => l.trim()) ?? '';
  const delimiter = detectDelimiter(firstLine);
  const rows = parseCsvRows(input, delimiter);
  if (rows.length === 0) return { delimiter, hasHeader: true, columns: [], confident: false };

  const headerRow = rows[0];
  const anyRole = headerRow.some((c) => headerRole(c) !== null);
  const looksLikeData = headerRow.some((c) => parseQuantity(c) !== null);
  // La prima riga è intestazione se riconosciamo un ruolo o se non sembra un dato.
  const hasHeader = hasHeaderOverride ?? (anyRole || !looksLikeData);

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0);

  const samplesByCol: string[][] = [];
  for (let i = 0; i < ncol; i++) {
    samplesByCol.push(dataRows.slice(0, SAMPLE_ROWS).map((r) => (r[i] ?? '').trim()).filter(Boolean));
  }
  const suggested = suggestFields(headerRow, hasHeader, samplesByCol, ncol);

  const columns: CsvColumn[] = [];
  for (let i = 0; i < ncol; i++) {
    columns.push({
      index: i,
      header: hasHeader ? (headerRow[i]?.trim() ?? '') : '',
      sample: samplesByCol[i],
      suggested: suggested[i],
    });
  }

  const idx = fieldsToColIndex(suggested);
  const confident = hasHeader && idx.ingredient >= 0 && idx.quantity >= 0;
  return { delimiter, hasHeader, columns, confident };
}

function buildNotes(row: string[], idx: ColIndex): string | null {
  const parts: string[] = [];
  if (idx.notes >= 0 && row[idx.notes]?.trim()) parts.push(row[idx.notes].trim());
  if (idx.allergens.length) {
    const a = idx.allergens.map((i) => row[i]?.trim()).filter(Boolean).join(', ');
    if (a) parts.push(`Allergeni: ${a}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Core condiviso: righe-dati + mappa colonne → ricette raggruppate. */
function buildRecipes(dataRows: string[][], idx: ColIndex): ParsedRecipe[] {
  const groups = new Map<string, ParsedRecipe>();

  for (const row of dataRows) {
    const recipeName = (idx.recipe >= 0 ? row[idx.recipe] : '')?.trim() || 'Ricetta importata';
    const ingName = cleanName((idx.ingredient >= 0 ? row[idx.ingredient] : '') ?? '');
    if (!ingName) continue; // riga senza ingrediente → saltata

    let recipe = groups.get(recipeName);
    if (!recipe) {
      recipe = {
        name: recipeName,
        basePortions: idx.portions >= 0 ? parsePortionsCell(row[idx.portions]) : null,
        category: idx.category >= 0 ? row[idx.category]?.trim() || null : null,
        notes: buildNotes(row, idx),
        ingredients: [],
        warnings: [],
      };
      if (recipeName === 'Ricetta importata') {
        recipe.warnings.push('Nome ricetta non presente nel file: rinominala prima di importare.');
      }
      groups.set(recipeName, recipe);
    }

    recipe.ingredients.push({
      rawText: row.join(' | '),
      name: ingName,
      quantity: idx.quantity >= 0 ? parseQuantity(row[idx.quantity]) : null,
      unit: idx.unit >= 0 ? normalizeUnit(row[idx.unit]) : null,
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

/**
 * Parser CSV AUTO (header auto-rilevati). Comportamento storico, ora costruito
 * sul core condiviso. Usato quando l'auto-detect è sufficiente.
 */
export function parseCsv(input: string): ParsedRecipe[] {
  const rows = csvRows(input);
  if (rows.length < 2) return [];
  const fields = rows[0].map((h) => roleToField(headerRole(h)) ?? 'ignore');
  const idx = fieldsToColIndex(fields);
  if (idx.ingredient < 0 && idx.recipe < 0) return [];
  return buildRecipes(rows.slice(1), idx);
}

/**
 * Parser CSV guidato dalla MAPPATURA utente (preview-layer). `hasHeader=false`
 * tratta la prima riga come dato (file senza intestazioni).
 */
export function parseCsvWithMapping(
  input: string,
  fields: ImportColumnField[],
  hasHeader: boolean,
): ParsedRecipe[] {
  const rows = csvRows(input);
  if (rows.length === 0) return [];
  const idx = fieldsToColIndex(fields);
  if (idx.ingredient < 0) return []; // l'ingrediente è il minimo assoluto
  return buildRecipes(hasHeader ? rows.slice(1) : rows, idx);
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
