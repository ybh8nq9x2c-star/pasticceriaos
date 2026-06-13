// =============================================================================
// Goods receipt engine — parser DDT (puro, best-effort dichiarato).
// Fixture: testo realistico di un DDT italiano (stesso formato usato
// nell'audit E2E: DDT-2026-0142).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { parseDdtText, parseNumber } from '../ddt-parser';

const DDT_REALISTICO = `MATTEO EMIRI - Ingrosso alimentare
Via dei Mulini 12, 20100 Milano - P.IVA 09876543210

DOCUMENTO DI TRASPORTO (DDT)
Numero: DDT-2026-0142    Data: 12/06/2026
Destinatario: Pasticceria luca toni
Causale: Vendita - Consegna a domicilio

RIGA  DESCRIZIONE                  QTA      PREZZO    TOTALE
1     Farina 00 sacco 25kg         25 kg    0,98      24,50
2     Burro 82% m.g.               6 kg     8,40      50,40
3     Zucchero semolato            10 kg    0,89      8,90
4     Uova fresche cat. A          180 pz   0,22      39,60
5     Mascarpone lotto MA26-0608   3 kg     6,90      20,70

Totale merce: EUR 207,10
Colli: 9 - Porto franco
Vettore: consegna diretta fornitore
Firma vettore: ____________  Firma destinatario: ____________`;

describe('parseDdtText — DDT realistico', () => {
  const parsed = parseDdtText(DDT_REALISTICO);

  it('estrae numero e data del DDT', () => {
    expect(parsed.header.ddtNumber).toBe('DDT-2026-0142');
    expect(parsed.header.ddtDate).toBe('2026-06-12');
  });

  it('estrae il mittente dalla testata', () => {
    expect(parsed.header.supplierName).toContain('MATTEO EMIRI');
  });

  it('estrae le 5 righe articolo con qty e unità corrette', () => {
    expect(parsed.lines).toHaveLength(5);
    const farina = parsed.lines[0];
    expect(farina.rawName).toBe('Farina 00 sacco 25kg');
    expect(farina.qty).toBe(25);
    expect(farina.unit).toBe('kg');
    const uova = parsed.lines[3];
    expect(uova.qty).toBe(180);
    expect(uova.unit).toBe('pz');
  });

  it('riconosce il lotto quando presente nella riga', () => {
    const mascarpone = parsed.lines[4];
    expect(mascarpone.lotNumber).toBe('MA26-0608');
  });

  it('ignora totali, vettore, firme (righe rumore)', () => {
    expect(parsed.lines.some((l) => /totale|vettore|firma/i.test(l.rawName))).toBe(false);
  });
});

describe('parseDdtText — robustezza', () => {
  it('testo non-DDT → zero righe + warning, MAI throw', () => {
    const parsed = parseDdtText('Relazione annuale\nSenza articoli qui.');
    expect(parsed.lines).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it('quantità con virgola decimale e unità alternative (lt, nr)', () => {
    const parsed = parseDdtText(
      'DDT n. 77 del 01/02/2026\nPanna fresca 4,5 lt 3,60\nVasetti coulis 12 nr 1,10',
    );
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0].qty).toBe(4.5);
    expect(parsed.lines[0].unit).toBe('l');
    expect(parsed.lines[1].unit).toBe('pz');
    expect(parsed.header.ddtNumber).toBe('77');
    expect(parsed.header.ddtDate).toBe('2026-02-01');
  });

  it('parseNumber gestisce virgola e punto', () => {
    expect(parseNumber('4,5')).toBe(4.5);
    expect(parseNumber('25')).toBe(25);
  });
});
