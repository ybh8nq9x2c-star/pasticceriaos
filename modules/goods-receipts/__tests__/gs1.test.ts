import { describe, it, expect } from 'vitest';
import { parseGs1, gs1DateToIso } from '../gs1';

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
