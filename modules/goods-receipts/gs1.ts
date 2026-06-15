// =============================================================================
// modules/goods-receipts/gs1.ts
// Parser GS1-128 PURO e testabile (nessun DOM, nessuna AI). Interpreta i dati
// scansionati da etichette industriali alimentari (pallet/colli): estrae SSCC,
// GTIN, lotto e scadenza dagli Application Identifier. NON è un decoder di
// immagini: lavora sulla STRINGA già decodificata (BarcodeDetector/ZXing/manuale).
//
// Robusto su: separatori FNC1 (GS \x1D), prefisso simbologia ]C1, forma con
// parentesi "(01)..(17)..", e barcode semplici (EAN/UPC/QR → non GS1).
// =============================================================================

export interface Gs1Parsed {
  /** true se i dati sono riconosciuti come GS1-128 (AI presenti). */
  isGs1: boolean;
  /** Application Identifier → valore grezzo. */
  ai: Record<string, string>;
  sscc?: string;        // (00) unità logistica / pallet
  gtin?: string;        // (01) codice prodotto
  lot?: string;         // (10) lotto
  expiry?: string;      // (17) scadenza → ISO YYYY-MM-DD
  bestBefore?: string;  // (15) → ISO YYYY-MM-DD
  /** Codice più utile per il match prodotto: GTIN se presente, altrimenti SSCC/raw. */
  primary: string;
  raw: string;
}

const GS = '\x1D'; // FNC1 separator

// AI a lunghezza FISSA (lunghezza del VALORE, AI escluso).
const FIXED: Record<string, number> = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2,
};
// AI a lunghezza VARIABILE (terminati da FNC1 o fine stringa). Sottoinsieme utile.
const VARIABLE = new Set(['10', '21', '22', '30', '37', '240', '241', '250', '251', '400', '401', '10']);

/** "YYMMDD" → "YYYY-MM-DD" (DD=00 → ultimo giorno del mese). null se non valido. */
export function gs1DateToIso(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = 2000 + yy; // alimentare: date future → 20YY
  if (dd === 0) dd = new Date(year, mm, 0).getDate(); // ultimo giorno del mese
  if (dd < 1 || dd > 31) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function cleanInput(raw: string): string {
  return raw
    .replace(/^\]C1/, '') // AIM symbology identifier GS1-128
    .replace(/^\]e0/, '') // alcuni reader (GS1 DataMatrix) → comunque parsabile
    .trim();
}

/** Parse della forma con parentesi: "(01)08001234567890(17)261031(10)L1". */
function parseParen(s: string): Record<string, string> | null {
  if (!s.includes('(')) return null;
  const ai: Record<string, string> = {};
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m: RegExpExecArray | null;
  let matched = false;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    ai[m[1]] = m[2].replace(/\x1D/g, '').trim();
  }
  return matched ? ai : null;
}

/** Parse della forma "elementstring" (AI concatenati, separatore FNC1 sui variabili). */
function parseElementString(s: string): Record<string, string> {
  const ai: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    // AI: prova 2, poi 3, poi 4 cifre.
    let aiKey = '';
    for (const len of [2, 3, 4]) {
      const cand = s.slice(i, i + len);
      if (FIXED[cand] !== undefined || VARIABLE.has(cand)) { aiKey = cand; break; }
    }
    if (!aiKey) break; // AI sconosciuto: ci fermiamo (conservativo, niente garbage)
    i += aiKey.length;
    if (FIXED[aiKey] !== undefined) {
      const val = s.slice(i, i + FIXED[aiKey]);
      ai[aiKey] = val;
      i += FIXED[aiKey];
    } else {
      // variabile: fino a FNC1 o fine
      const gsIdx = s.indexOf(GS, i);
      const end = gsIdx === -1 ? s.length : gsIdx;
      ai[aiKey] = s.slice(i, end);
      i = end;
    }
  }
  return ai;
}

/** Riconosce se la stringa "sembra" GS1 anche senza FNC1 (BarcodeDetector li toglie). */
function looksGs1(s: string): boolean {
  if (s.includes(GS) || s.startsWith('(')) return true;
  if (/^00\d{18}$/.test(s)) return true;             // SSCC
  if (/^01\d{14}/.test(s) && s.length >= 16) return true; // GTIN AI (+ eventuali altri AI)
  return false;
}

export function parseGs1(rawInput: string): Gs1Parsed {
  const raw = (rawInput ?? '').trim();
  const s = cleanInput(raw);

  let ai: Record<string, string> = {};
  if (looksGs1(s)) {
    ai = parseParen(s) ?? parseElementString(s);
  }

  const isGs1 = Object.keys(ai).length > 0;
  const gtin = ai['01'] || undefined;
  const sscc = ai['00'] || undefined;
  const lot = ai['10'] || undefined;
  const expiry = ai['17'] ? gs1DateToIso(ai['17']) ?? undefined : undefined;
  const bestBefore = ai['15'] ? gs1DateToIso(ai['15']) ?? undefined : undefined;

  return {
    isGs1,
    ai,
    sscc,
    gtin,
    lot,
    expiry,
    bestBefore,
    primary: gtin ?? sscc ?? raw,
    raw,
  };
}
