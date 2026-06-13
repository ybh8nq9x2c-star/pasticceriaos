import { describe, it, expect } from 'vitest';
import {
  validateVat,
  italianVatChecksum,
  normalizeLegalForm,
  guessLegalForm,
} from '../vat';

describe('italianVatChecksum', () => {
  it('accetta una P.IVA con checksum corretto', () => {
    expect(italianVatChecksum('00743110157')).toBe(true);
  });
  it('rifiuta checksum errato e formati non a 11 cifre', () => {
    expect(italianVatChecksum('00743110158')).toBe(false);
    expect(italianVatChecksum('12345678901')).toBe(false);
    expect(italianVatChecksum('123')).toBe(false);
    expect(italianVatChecksum('abcdefghijk')).toBe(false);
  });
});

describe('validateVat', () => {
  it('valida e normalizza (prefisso IT, spazi, punti)', () => {
    expect(validateVat('00743110157')).toMatchObject({ ok: true, country: 'IT', number: '00743110157' });
    expect(validateVat('IT 00743110157')).toMatchObject({ ok: true, number: '00743110157', formatted: 'IT00743110157' });
    expect(validateVat('00743.110.157')).toMatchObject({ ok: true, number: '00743110157' });
  });
  it('rifiuta vuoto, lunghezza errata, checksum errato', () => {
    expect(validateVat('').ok).toBe(false);
    expect(validateVat('123').ok).toBe(false);
    expect(validateVat('00743110158').ok).toBe(false);
  });
  it('estera → non verificata ma con motivo (non blocca a monte)', () => {
    const r = validateVat('DE123456789');
    expect(r.ok).toBe(false);
    expect(r.country).toBe('DE');
    expect(r.reason).toMatch(/italiana/i);
  });
});

describe('forma giuridica', () => {
  it('normalizeLegalForm accetta solo valori validi', () => {
    expect(normalizeLegalForm('srl')).toBe('srl');
    expect(normalizeLegalForm('ditta_individuale')).toBe('ditta_individuale');
    expect(normalizeLegalForm('inesistente')).toBeNull();
    expect(normalizeLegalForm('')).toBeNull();
  });
  it('guessLegalForm suggerisce dal suffisso del nome (trasparente)', () => {
    expect(guessLegalForm('Molino Bianchi S.R.L.')).toBe('srl');
    expect(guessLegalForm('Rossi S.r.l.s.')).toBe('srls');
    expect(guessLegalForm('Caffè del Corso S.p.A.')).toBe('spa');
    expect(guessLegalForm('Mario Rossi')).toBeNull();
  });
});
