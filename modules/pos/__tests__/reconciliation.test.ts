// =============================================================================
// Riconciliazione giornaliera (pura): POS vs BakeryOS, mismatch onesti.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { compareDailyTotals } from '../reconciliation';

describe('compareDailyTotals', () => {
  it('giorno allineato → nessun mismatch', () => {
    const rows = compareDailyTotals(
      [{ day: '2026-07-01', eventsReceived: 3, eventsFailed: 0, posTotal: 45.5 }],
      [{ day: '2026-07-01', salesRecorded: 3, salesTotal: 45.5 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].mismatch).toBe(false);
    expect(rows[0].totalDelta).toBe(0);
  });

  it('importi diversi → mismatch con delta POS − BakeryOS', () => {
    const rows = compareDailyTotals(
      [{ day: '2026-07-01', eventsReceived: 2, eventsFailed: 0, posTotal: 30 }],
      [{ day: '2026-07-01', salesRecorded: 2, salesTotal: 25.5 }],
    );
    expect(rows[0].mismatch).toBe(true);
    expect(rows[0].totalDelta).toBe(4.5);
  });

  it('evento fallito → mismatch anche se i totali tornano', () => {
    const rows = compareDailyTotals(
      [{ day: '2026-07-01', eventsReceived: 2, eventsFailed: 1, posTotal: 20 }],
      [{ day: '2026-07-01', salesRecorded: 2, salesTotal: 20 }],
    );
    expect(rows[0].mismatch).toBe(true);
  });

  it('giorno presente solo lato POS (vendite perse) → mismatch', () => {
    const rows = compareDailyTotals(
      [{ day: '2026-07-01', eventsReceived: 4, eventsFailed: 0, posTotal: 60 }],
      [],
    );
    expect(rows[0].mismatch).toBe(true);
    expect(rows[0].salesRecorded).toBe(0);
  });

  it('giorno presente solo lato BakeryOS (vendite manuali POS-source anomale) → mismatch', () => {
    const rows = compareDailyTotals([], [{ day: '2026-07-01', salesRecorded: 1, salesTotal: 10 }]);
    expect(rows[0].mismatch).toBe(true);
    expect(rows[0].eventsReceived).toBe(0);
  });

  it('ordinamento: giorni più recenti prima', () => {
    const rows = compareDailyTotals(
      [
        { day: '2026-06-30', eventsReceived: 1, eventsFailed: 0, posTotal: 5 },
        { day: '2026-07-01', eventsReceived: 1, eventsFailed: 0, posTotal: 5 },
      ],
      [],
    );
    expect(rows.map((r) => r.day)).toEqual(['2026-07-01', '2026-06-30']);
  });
});
