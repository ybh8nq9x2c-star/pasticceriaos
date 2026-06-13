// =============================================================================
// modules/goods-receipts/ddt-parser.ts
// Parser PURO del testo estratto da un DDT PDF → header + righe candidate.
// Best-effort dichiarato: i DDT reali variano molto; il parser è tollerante,
// non lancia mai per formato inatteso e accumula `warnings`. Il flusso UI
// permette SEMPRE correzione/inserimento manuale (nessun dead-end).
// Unit-testato su testi DDT realistici (vedi __tests__/ddt-parser.test.ts).
// =============================================================================

import type { UnitOfMeasure } from '@/lib/database.types';

export interface ParsedDdtHeader {
  supplierName: string | null;
  ddtNumber: string | null;
  /** ISO yyyy-mm-dd */
  ddtDate: string | null;
}

export interface ParsedDdtLine {
  rawName: string;
  qty: number;
  unit: UnitOfMeasure;
  sku: string | null;
  lotNumber: string | null;
}

export interface ParsedDdt {
  header: ParsedDdtHeader;
  lines: ParsedDdtLine[];
  warnings: string[];
}

// Unità riconosciute nei DDT italiani → unit_of_measure dell'app.
const UNIT_MAP: Record<string, UnitOfMeasure> = {
  kg: 'kg', g: 'g', gr: 'g', l: 'l', lt: 'l', ml: 'ml',
  pz: 'pz', nr: 'pz', n: 'pz', pcs: 'pz', cf: 'pz', ct: 'pz', conf: 'pz',
  bust: 'bustina', bustina: 'bustina', bustine: 'bustina',
  fg: 'foglio', foglio: 'foglio', fogli: 'foglio',
};
const UNIT_RE = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length).join('|');

// Righe da ignorare sempre (testata/footer documento).
const NOISE_RE = new RegExp(
  [
    'totale', 'imponibile', 'iva\\b', 'aliquota', 'pagamento', 'vettore',
    'firma', 'colli', 'porto', 'aspetto', 'causale', 'destinatario',
    'mittente', 'pagina', 'p\\.? ?iva', 'codice fiscale', 'trasporto a',
    'data ritiro', 'peso lordo', 'peso netto', 'segue', 'riepilogo',
  ].join('|'),
  'i',
);

const NUM = String.raw`\d{1,6}(?:[.,]\d{1,4})?`;

/**
 * Coppie quantità+unità nella riga. Si usa l'ULTIMA occorrenza: nei DDT a
 * colonne la qty di riga sta a destra della descrizione, mentre eventuali
 * "25kg" DENTRO il nome ("Farina 00 sacco 25kg") stanno prima.
 */
const PAIR_RE = new RegExp(String.raw`(${NUM})\s*(${UNIT_RE})\b`, 'gi');

/** Dopo la coppia qty+unit di colonna restano solo prezzi/numeri/blank. */
const TRAILING_OK_RE = /^[\s\d.,€%/-]*$/;

/** SKU in colonna a inizio descrizione: TOKEN maiuscolo + 2+ spazi. */
const SKU_PREFIX_RE = /^([A-Z0-9][A-Z0-9\-./]{2,14})\s{2,}(.+)$/;

const LOT_RE = /lotto\s*[:.]?\s*([A-Z0-9][A-Z0-9\-./]{1,24})/i;
const DDT_NUM_RE = /(?:d\.?d\.?t\.?|documento\s+di\s+trasporto|bolla)[^\dA-Z]{0,12}(?:n(?:um(?:ero)?)?\.?\s*°?\s*)?([A-Z0-9][A-Z0-9\-./]{0,19})/i;
/** "Numero: DDT-2026-0142" / "N. 77": etichetta esplicita → token completo. */
const DDT_LABELED_RE = /\b(?:numero|num\.?|nr\.?|n[°.])\s*:?\s*([A-Z]{0,6}[-/]?\d[\w\-./]*)/i;
const DATE_RE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;

export function parseNumber(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function toIsoDate(d: string, m: string, y: string): string | null {
  const day = parseInt(d, 10);
  const month = parseInt(m, 10);
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Estrae header + righe dal testo grezzo di un DDT. Mai un throw per formato. */
export function parseDdtText(text: string): ParsedDdt {
  const warnings: string[] = [];
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l) => l.trim().length > 0);

  // ── Header ──────────────────────────────────────────────────────────────────
  let ddtNumber: string | null = null;
  let ddtDate: string | null = null;
  let supplierName: string | null = null;

  for (const line of rawLines.slice(0, 25)) {
    if (!ddtNumber && /ddt|bolla|trasporto/i.test(line)) {
      // 1) etichetta esplicita ("Numero: DDT-2026-0142") → token completo
      const lab = line.match(DDT_LABELED_RE);
      if (lab && /\d/.test(lab[1]) && !DATE_RE.test(lab[1])) ddtNumber = lab[1];
    }
    if (!ddtNumber) {
      // 2) fallback: token dopo la keyword DDT/bolla
      const m = line.match(DDT_NUM_RE);
      // un numero documento contiene almeno una cifra (scarta "(DDT)" e simili)
      // e non è una data ("DDT del 12/06").
      if (m && /\d/.test(m[1]) && !DATE_RE.test(m[1])) ddtNumber = m[1];
    }
    if (!ddtDate) {
      const m = line.match(DATE_RE);
      if (m) ddtDate = toIsoDate(m[1], m[2], m[3]);
    }
  }

  // Mittente: prima riga "da intestazione" non-rumore e non-numerica.
  for (const line of rawLines.slice(0, 6)) {
    const t = line.trim();
    if (t.length >= 3 && !NOISE_RE.test(t) && !DDT_NUM_RE.test(t) && !/\d{4,}/.test(t)) {
      supplierName = t.replace(/\s{2,}.*$/, '').trim() || null;
      break;
    }
  }

  if (!ddtNumber) warnings.push('Numero DDT non riconosciuto nel documento.');
  if (!ddtDate) warnings.push('Data DDT non riconosciuta nel documento.');

  // ── Righe articolo ──────────────────────────────────────────────────────────
  const lines: ParsedDdtLine[] = [];
  for (const line of rawLines) {
    let t = line.trim();
    if (NOISE_RE.test(t)) continue;

    // indice riga in colonna ("1   Farina…") → via
    t = t.replace(/^\d{1,3}\s{2,}/, '');

    // tutte le coppie qty+unit; la coppia "di colonna" è l'ULTIMA seguita
    // solo da prezzi/numeri (o fine riga).
    const pairs = [...t.matchAll(PAIR_RE)];
    let chosen: RegExpMatchArray | null = null;
    for (let i = pairs.length - 1; i >= 0; i--) {
      const p = pairs[i];
      const after = t.slice((p.index ?? 0) + p[0].length);
      if (TRAILING_OK_RE.test(after)) { chosen = p; break; }
    }
    if (!chosen) continue;

    const qty = parseNumber(chosen[1]);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const nameSlice = t.slice(0, chosen.index ?? 0);

    // SKU in colonna prima della descrizione (token con cifra/trattino + 2 spazi)
    let sku: string | null = null;
    let namePart = nameSlice;
    const skuMatch = nameSlice.match(SKU_PREFIX_RE);
    if (skuMatch && /[\d-]/.test(skuMatch[1])) {
      sku = skuMatch[1];
      namePart = skuMatch[2];
    }

    const rawName = namePart.replace(/\s{2,}/g, ' ').trim();
    // descrizioni vuote o "solo numeri" sono quasi sempre righe di totali
    if (rawName.length < 3 || !/[a-zà-ù]/i.test(rawName)) continue;

    const lot = t.match(LOT_RE);
    lines.push({
      rawName,
      qty,
      unit: UNIT_MAP[chosen[2].toLowerCase()],
      sku,
      lotNumber: lot ? lot[1] : null,
    });
  }

  if (lines.length === 0) {
    warnings.push(
      'Nessuna riga articolo riconosciuta automaticamente: aggiungi le righe manualmente o tramite scanner.',
    );
  }

  return { header: { supplierName, ddtNumber, ddtDate }, lines, warnings };
}
