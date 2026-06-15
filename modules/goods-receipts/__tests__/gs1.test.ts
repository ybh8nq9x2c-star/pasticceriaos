import { describe, it, expect } from 'vitest';
import { parseGs1, gs1DateToIso, gs1IsoToItalian } from '../gs1';

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
