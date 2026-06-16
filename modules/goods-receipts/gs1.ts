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
  gtinContent?: string; // (02) GTIN dei trade item contenuti nell'unità logistica
  lot?: string;         // (10) lotto
  expiry?: string;      // (17) scadenza → ISO YYYY-MM-DD
  bestBefore?: string;  // (15) → ISO YYYY-MM-DD
  /**
   * Data da usare nel campo "Scadenza" del ricevimento: usa la scadenza (17)
   * se presente, altrimenti il termine minimo di conservazione / best-before
   * (15). ISO YYYY-MM-DD. Le etichette alimentari spesso riportano solo l'una
   * o l'altra: il campo deve popolarsi in entrambi i casi.
   */
  expiryForReceipt?: string;
  caseQuantity?: number;   // (37) numero di trade item nell'unità logistica
  productionDate?: string; // (11) → ISO
  packagingDate?: string;  // (13) → ISO
  shippingDate?: string;   // (16) → ISO
  /** Peso netto da AI 310x (kg) / 320x (lb), con il decimale già applicato. */
  netWeight?: { value: number; unit: 'kg' | 'lb' };
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

/**
 * Lunghezza del valore per un AGGIUNTO a lunghezza fissa, o undefined se non
 * fisso. Oltre alla tabella FIXED, copre la famiglia di misura 31xx–36xx (peso,
 * lunghezza, volume…): hanno tutti valore a 6 cifre con l'ultimo digit dell'AI
 * che indica la posizione del decimale.
 */
function fixedLen(cand: string): number | undefined {
  if (FIXED[cand] !== undefined) return FIXED[cand];
  if (/^3[1-6]\d\d$/.test(cand)) return 6;
  return undefined;
}

/** "YYYY-MM-DD" → "GG/MM/AAAA" per la UI italiana. '' se non valido. */
export function gs1IsoToItalian(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** "YYMMDD" → "YYYY-MM-DD" (DD=00 → ultimo giorno del mese). null se non valido. */
export function gs1DateToIso(yymmdd: string): string | null {
  const clean = yymmdd.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  yymmdd = clean;
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
function isSep(ch: string): boolean {
  // FNC1 oppure spazio/tab: alcuni scanner separano gli AI con spazi al posto
  // del FNC1 (es. "15271203 10L6154R") invece di concatenarli.
  return ch === GS || ch === ' ' || ch === '\t';
}

function parseElementString(s: string): Record<string, string> {
  const ai: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    if (isSep(s[i])) { i++; continue; }
    // AI: prova 2, poi 3, poi 4 cifre.
    let aiKey = '';
    for (const len of [2, 3, 4]) {
      const cand = s.slice(i, i + len);
      if (fixedLen(cand) !== undefined || VARIABLE.has(cand)) { aiKey = cand; break; }
    }
    if (!aiKey) break; // AI sconosciuto: ci fermiamo (conservativo, niente garbage)
    i += aiKey.length;
    const flen = fixedLen(aiKey);
    if (flen !== undefined) {
      ai[aiKey] = s.slice(i, i + flen);
      i += flen;
    } else {
      // variabile: fino al prossimo separatore (FNC1/spazio) o fine stringa.
      let end = i;
      while (end < s.length && !isSep(s[end])) end++;
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
  // Element-string SENZA parentesi con AI separati da spazi (scanner che non
  // emette FNC1): inizia con un AI noto ed è "spaziata". Lo spazio + l'AI noto
  // la distinguono da un EAN/UPC semplice (che è solo cifre, senza spazi).
  const head = s.replace(/^\s+/, '').slice(0, 2);
  if (/\s/.test(s) && (FIXED[head] !== undefined || VARIABLE.has(head))) return true;
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
  const gtinContent = ai['02'] || undefined;
  const sscc = ai['00'] || undefined;
  const lot = ai['10'] || undefined;
  const expiry = ai['17'] ? gs1DateToIso(ai['17']) ?? undefined : undefined;
  const bestBefore = ai['15'] ? gs1DateToIso(ai['15']) ?? undefined : undefined;
  // Campo Scadenza del ricevimento: scadenza (17) se c'è, altrimenti best-before (15).
  const expiryForReceipt = expiry ?? bestBefore;
  const caseQuantity = ai['37'] !== undefined ? toInt(ai['37']) : undefined;
  const productionDate = ai['11'] ? gs1DateToIso(ai['11']) ?? undefined : undefined;
  const packagingDate = ai['13'] ? gs1DateToIso(ai['13']) ?? undefined : undefined;
  const shippingDate = ai['16'] ? gs1DateToIso(ai['16']) ?? undefined : undefined;
  const netWeight = extractNetWeight(ai);

  return {
    isGs1,
    ai,
    sscc,
    gtin,
    gtinContent,
    lot,
    expiry,
    bestBefore,
    expiryForReceipt,
    caseQuantity,
    productionDate,
    packagingDate,
    shippingDate,
    netWeight,
    primary: gtin ?? sscc ?? raw,
    raw,
  };
}

function toInt(v: string): number | undefined {
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Peso netto da AI 310x (kg) / 320x (lb): valore 6 cifre, decimale = 4ª cifra dell'AI. */
function extractNetWeight(ai: Record<string, string>): { value: number; unit: 'kg' | 'lb' } | undefined {
  for (const [k, raw] of Object.entries(ai)) {
    const kg = /^310(\d)$/.exec(k);
    const lb = /^320(\d)$/.exec(k);
    const m = kg ?? lb;
    if (m && /^\d{6}$/.test(raw)) {
      const decimals = Number(m[1]);
      return { value: Number(raw) / 10 ** decimals, unit: kg ? 'kg' : 'lb' };
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappatura per la PERSISTENZA: colonne canoniche + raw + mappa AID completa.
// Nessun dato GS1 utile va perso: ciò che non ha una colonna finisce in gs1Ai.
// ─────────────────────────────────────────────────────────────────────────────

export interface Gs1LineFields {
  gtin: string | null;
  sscc: string | null;
  caseQuantity: number | null;
  productionDate: string | null; // ISO
  gs1Raw: string | null;
  gs1Ai: Record<string, string> | null;
}

export function gs1ToLineFields(p: Gs1Parsed): Gs1LineFields {
  if (!p.isGs1) {
    return { gtin: null, sscc: null, caseQuantity: null, productionDate: null, gs1Raw: null, gs1Ai: null };
  }
  return {
    gtin: p.gtin ?? p.gtinContent ?? null,
    sscc: p.sscc ?? null,
    caseQuantity: p.caseQuantity ?? null,
    productionDate: p.productionDate ?? null,
    gs1Raw: p.raw || null,
    gs1Ai: Object.keys(p.ai).length > 0 ? p.ai : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering leggibile della sezione "Dati GS1 rilevati": etichetta umana per
// OGNI AI trovato (date formattate, peso calcolato). Puro e testabile.
// ─────────────────────────────────────────────────────────────────────────────

const AI_LABELS: Record<string, string> = {
  '00': 'SSCC (unità logistica)',
  '01': 'GTIN',
  '02': 'GTIN contenuto',
  '10': 'Lotto',
  '11': 'Data produzione',
  '12': 'Termine pagamento',
  '13': 'Data confezionamento',
  '15': 'Da consumarsi pref. entro',
  '16': 'Data spedizione',
  '17': 'Scadenza',
  '20': 'Variante prodotto',
  '21': 'Numero seriale',
  '22': 'Dati prodotto',
  '30': 'Quantità',
  '37': 'Numero colli/pezzi',
  '240': 'Identificativo aggiuntivo',
  '250': 'Numero seriale secondario',
  '400': 'Ordine cliente',
  '401': 'Numero spedizione',
};

const DATE_AIS = new Set(['11', '12', '13', '15', '16', '17']);

export interface Gs1DetailRow {
  code: string;
  label: string;
  value: string;
}

export function gs1DetailRows(ai: Record<string, string> | null | undefined): Gs1DetailRow[] {
  if (!ai) return [];
  return Object.entries(ai).map(([code, rawVal]) => {
    let value = rawVal;
    if (DATE_AIS.has(code)) {
      value = gs1IsoToItalian(gs1DateToIso(rawVal)) || rawVal;
    } else if (/^310(\d)$/.test(code) || /^320(\d)$/.test(code)) {
      const w = extractNetWeight({ [code]: rawVal });
      if (w) value = `${w.value} ${w.unit}`;
    }
    const label =
      AI_LABELS[code] ??
      (/^310\d$/.test(code) ? 'Peso netto (kg)' : /^320\d$/.test(code) ? 'Peso netto (lb)' : `AI (${code})`);
    return { code, label, value };
  });
}
