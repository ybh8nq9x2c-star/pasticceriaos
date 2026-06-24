// =============================================================================
// Applicazione "settimana tipo" (logica pura): prossimi 7 giorni, ogni weekday
// una volta, niente passato, solo i giorni con righe nel template.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { computeApplyCandidates, isoDate } from '../template';

const item = (recipeId: string, batchCount = 1) => ({ recipeId, batchCount });

describe('isoDate', () => {
  it('formatta in YYYY-MM-DD locale', () => {
    expect(isoDate(new Date(2026, 5, 1))).toBe('2026-06-01'); // mese 0-based → giugno
    expect(isoDate(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('computeApplyCandidates', () => {
  // 2026-06-22 è un LUNEDÌ (getDay()===1).
  const monday = new Date(2026, 5, 22);

  it('un template solo per lunedì → un candidato lunedì (oggi)', () => {
    const byWeekday = new Map([[1, [item('r1', 3)]]]);
    const out = computeApplyCandidates(byWeekday, monday);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-06-22', weekday: 1, items: [item('r1', 3)] });
  });

  it('template lun+mer+sab → 3 candidati nelle date giuste della settimana', () => {
    const byWeekday = new Map([
      [1, [item('lun')]],
      [3, [item('mer')]],
      [6, [item('sab')]],
    ]);
    const out = computeApplyCandidates(byWeekday, monday);
    expect(out.map((c) => c.date)).toEqual(['2026-06-22', '2026-06-24', '2026-06-27']);
  });

  it('ogni weekday compare UNA sola volta nei 7 giorni; i giorni vuoti sono esclusi', () => {
    const byWeekday = new Map([[2, [item('mar')]]]); // solo martedì
    const out = computeApplyCandidates(byWeekday, monday);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-06-23'); // martedì
  });

  it('partendo da giovedì, copre fino al mercoledì successivo (rolling 7 giorni)', () => {
    const thursday = new Date(2026, 5, 25); // giovedì
    const byWeekday = new Map([
      [4, [item('gio')]],
      [3, [item('mer')]], // mercoledì cade la settimana dopo
    ]);
    const out = computeApplyCandidates(byWeekday, thursday);
    expect(out.map((c) => c.date)).toEqual(['2026-06-25', '2026-07-01']);
  });

  it('template vuoto → nessun candidato', () => {
    expect(computeApplyCandidates(new Map(), monday)).toEqual([]);
  });

  it('clona gli items (no mutazioni condivise)', () => {
    const shared = [item('r1')];
    const byWeekday = new Map([[1, shared]]);
    const out = computeApplyCandidates(byWeekday, monday);
    out[0].items[0].batchCount = 99;
    expect(shared[0].batchCount).toBe(1);
  });
});
