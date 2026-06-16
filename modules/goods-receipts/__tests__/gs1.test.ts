import { describe, it, expect } from 'vitest';
import { parseGs1, gs1DateToIso, gs1IsoToItalian, gs1ToLineFields, gs1DetailRows } from '../gs1';

const GS = '\x1D';

describe('gs1DateToIso', () => {
  it('YYMMDD → ISO; DD=00 → ultimo giorno del mese', () => {
    expect(gs1DateToIso('261031')).toBe('2026-10-31');
    expect(gs1DateToIso('260200')).toBe('2026-02-28');
    expect(gs1DateToIso('261301')).toBeNull(); // mese non valido
    expect(gs1DateToIso('abc')).toBeNull();
  });
});

describe('parseGs1', () => {
  it('SSCC (00) — pallet', () => {
    const r = parseGs1('00340123450000000017');
    expect(r.isGs1).toBe(true);
    expect(r.sscc).toBe('340123450000000017');
    expect(r.gtin).toBeUndefined();
    expect(r.primary).toBe('340123450000000017');
  });

  it('GTIN (01) + scadenza (17) + lotto (10) — element string', () => {
    const r = parseGs1('01080012345678901726103110L1A2');
    expect(r.isGs1).toBe(true);
    expect(r.gtin).toBe('08001234567890');
    expect(r.expiry).toBe('2026-10-31');
    expect(r.lot).toBe('L1A2');
    expect(r.primary).toBe('08001234567890'); // GTIN preferito per il match
  });

  it('forma con parentesi', () => {
    const r = parseGs1('(01)08001234567890(17)261031(10)ABC123');
    expect(r.gtin).toBe('08001234567890');
    expect(r.expiry).toBe('2026-10-31');
    expect(r.lot).toBe('ABC123');
  });

  it('prefisso ]C1 + separatore FNC1 tra AI variabili', () => {
    const r = parseGs1(`]C10108001234567890` + `10LOT1` + GS + `308`);
    expect(r.gtin).toBe('08001234567890');
    expect(r.lot).toBe('LOT1');
    expect(r.ai['30']).toBe('8');
  });

  it('EAN-13 semplice → NON GS1, passa grezzo', () => {
    const r = parseGs1('8001234567890');
    expect(r.isGs1).toBe(false);
    expect(r.gtin).toBeUndefined();
    expect(r.primary).toBe('8001234567890');
  });

  it('EAN-13 che inizia per 01 → non confuso con GTIN AI', () => {
    const r = parseGs1('0123456789012');
    expect(r.isGs1).toBe(false);
    expect(r.primary).toBe('0123456789012');
  });
});

describe('gs1IsoToItalian', () => {
  it('ISO → GG/MM/AAAA', () => {
    expect(gs1IsoToItalian('2027-12-03')).toBe('03/12/2027');
    expect(gs1IsoToItalian(undefined)).toBe('');
    expect(gs1IsoToItalian('non-data')).toBe('');
  });
});

// ── Scadenza da AI multipli, ordine indifferente (bug best-before (15)) ──────
describe('parseGs1 — AI multipli e scadenza (15)/(17)', () => {
  // NB sul lotto: il valore dell'AI (10) è una stringa OPACA (tracciabilità
  // HACCP). Il parser NON inventa caratteri: "L6154R" resta "L6154R"; lo spazio
  // compare solo se è davvero nella sorgente (vedi caso "con spazi").

  it('1) (15)271203(10)L6154R → best-before (15) → Scadenza 03/12/2027 + lotto', () => {
    const r = parseGs1('(15)271203(10)L6154R');
    expect(r.expiry).toBeUndefined();              // nessun AI 17
    expect(r.bestBefore).toBe('2027-12-03');       // AI 15
    expect(r.expiryForReceipt).toBe('2027-12-03'); // campo Scadenza UI
    expect(gs1IsoToItalian(r.expiryForReceipt)).toBe('03/12/2027');
    expect(r.lot).toBe('L6154R');
  });

  it('2) (10)L6154R(15)271203 → stesso risultato a ordine invertito', () => {
    const r = parseGs1('(10)L6154R(15)271203');
    expect(r.expiryForReceipt).toBe('2027-12-03');
    expect(r.lot).toBe('L6154R');
  });

  it('3) (00)380000412300656352 → SSCC', () => {
    const r = parseGs1('(00)380000412300656352');
    expect(r.isGs1).toBe(true);
    expect(r.sscc).toBe('380000412300656352');
    expect(r.primary).toBe('380000412300656352');
  });

  it('4) (01)…(15)…(10)… → GTIN + scadenza + lotto tutti estratti', () => {
    const r = parseGs1('(01)18052536243030(15)271203(10)L6154R');
    expect(r.gtin).toBe('18052536243030');
    expect(r.expiryForReceipt).toBe('2027-12-03');
    expect(gs1IsoToItalian(r.expiryForReceipt)).toBe('03/12/2027');
    expect(r.lot).toBe('L6154R');
    expect(r.primary).toBe('18052536243030');
  });

  it('5) con spazi: "(15) 271203  (10) L6154 R" → scadenza + lotto con spazio reale', () => {
    const r = parseGs1('(15) 271203  (10) L6154 R');
    expect(r.expiryForReceipt).toBe('2027-12-03');
    expect(r.lot).toBe('L6154 R'); // lo spazio è nella sorgente → preservato
  });

  it('6) senza parentesi, AI separati da spazio: "15271203 10L6154R"', () => {
    const r = parseGs1('15271203 10L6154R');
    expect(r.isGs1).toBe(true);
    expect(r.expiryForReceipt).toBe('2027-12-03');
    expect(r.lot).toBe('L6154R');
  });
});

// ── Tracciabilità GS1: AI estesi, peso, mapping persistenza, rendering UI ─────
describe('parseGs1 — AI estesi per tracciabilità', () => {
  it('lotto + best before (15)', () => {
    const r = parseGs1('(15)271203(10)L6154R');
    expect(r.lot).toBe('L6154R');
    expect(r.bestBefore).toBe('2027-12-03');
    expect(r.expiryForReceipt).toBe('2027-12-03');
  });

  it('GTIN + lotto + scadenza (17)', () => {
    const r = parseGs1('(01)18052536243030(17)271203(10)L6154R');
    expect(r.gtin).toBe('18052536243030');
    expect(r.expiry).toBe('2027-12-03');
    expect(r.expiryForReceipt).toBe('2027-12-03');
    expect(r.lot).toBe('L6154R');
  });

  it('SSCC (00)', () => {
    const r = parseGs1('(00)380000412300656352');
    expect(r.sscc).toBe('380000412300656352');
    expect(r.gtin).toBeUndefined();
  });

  it('numero colli (37) → caseQuantity numerico', () => {
    const r = parseGs1('(01)18052536243030(37)68(10)L6154R');
    expect(r.gtin).toBe('18052536243030');
    expect(r.caseQuantity).toBe(68);
    expect(r.lot).toBe('L6154R');
  });

  it('data produzione (11)', () => {
    const r = parseGs1('(11)260101(10)L1');
    expect(r.productionDate).toBe('2026-01-01');
  });

  it('peso netto 310x (kg) con decimale applicato', () => {
    const r = parseGs1('(01)18052536243030(3103)001250');
    expect(r.netWeight).toEqual({ value: 1.25, unit: 'kg' });
  });

  it('più AI insieme: GTIN contenuto (02) + SSCC (00) + colli (37)', () => {
    const r = parseGs1('(00)380000412300656352(02)18052536243030(37)68');
    expect(r.sscc).toBe('380000412300656352');
    expect(r.gtinContent).toBe('18052536243030');
    expect(r.caseQuantity).toBe(68);
  });
});

describe('gs1ToLineFields — mapping per la persistenza', () => {
  it('colonne canoniche + raw + mappa AI completa', () => {
    const f = gs1ToLineFields(parseGs1('(00)380000412300656352(02)18052536243030(37)68'));
    expect(f.sscc).toBe('380000412300656352');
    expect(f.gtin).toBe('18052536243030'); // (02) usato come GTIN se manca (01)
    expect(f.caseQuantity).toBe(68);
    expect(f.gs1Raw).toBe('(00)380000412300656352(02)18052536243030(37)68');
    expect(f.gs1Ai).toEqual({ '00': '380000412300656352', '02': '18052536243030', '37': '68' });
  });

  it('non-GS1 → tutto null (niente dati spuri)', () => {
    const f = gs1ToLineFields(parseGs1('8001234567890'));
    expect(f).toEqual({ gtin: null, sscc: null, caseQuantity: null, productionDate: null, gs1Raw: null, gs1Ai: null });
  });
});

describe('gs1DetailRows — rendering "Dati GS1 rilevati"', () => {
  it('etichette umane, date formattate, peso calcolato', () => {
    const rows = gs1DetailRows({ '00': '380000412300656352', '17': '271203', '37': '68', '3103': '001250' });
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
    expect(byCode['00'].label).toBe('SSCC (unità logistica)');
    expect(byCode['17'].label).toBe('Scadenza');
    expect(byCode['17'].value).toBe('03/12/2027');
    expect(byCode['37'].label).toBe('Numero colli/pezzi');
    expect(byCode['37'].value).toBe('68');
    expect(byCode['3103'].label).toBe('Peso netto (kg)');
    expect(byCode['3103'].value).toBe('1.25 kg');
  });

  it('null → nessuna riga', () => {
    expect(gs1DetailRows(null)).toEqual([]);
  });
});
