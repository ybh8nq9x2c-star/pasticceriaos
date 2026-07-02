// =============================================================================
// modules/pos/reconciliation.ts
// Logica PURA di riconciliazione giornaliera: confronta ciò che il POS ci ha
// MANDATO (pos_events, totali dal payload) con ciò che BakeryOS ha REGISTRATO
// (sales). Evidenzia i mismatch senza correggere nulla in automatico: la
// correzione passa da replay/mapping/import, mai da aggiustamenti silenziosi.
// =============================================================================

export interface PosEventDaily {
  day: string; // YYYY-MM-DD
  eventsReceived: number; // eventi 'sale' ricevuti (esclusi reversal)
  eventsFailed: number;
  posTotal: number; // somma total_cents/100 dei payload sale
}

export interface SalesDaily {
  day: string;
  salesRecorded: number; // vendite non stornate
  salesTotal: number; // somma total_amount
}

export interface ReconciliationRow {
  day: string;
  eventsReceived: number;
  eventsFailed: number;
  posTotal: number;
  salesRecorded: number;
  salesTotal: number;
  /** POS − BakeryOS (importi). 0 = allineato. */
  totalDelta: number;
  mismatch: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Join per giorno + flag mismatch (conteggi o importi che non tornano). */
export function compareDailyTotals(pos: PosEventDaily[], sales: SalesDaily[]): ReconciliationRow[] {
  const byDay = new Map<string, ReconciliationRow>();

  for (const p of pos) {
    byDay.set(p.day, {
      day: p.day,
      eventsReceived: p.eventsReceived,
      eventsFailed: p.eventsFailed,
      posTotal: round2(p.posTotal),
      salesRecorded: 0,
      salesTotal: 0,
      totalDelta: round2(p.posTotal),
      mismatch: true,
    });
  }
  for (const s of sales) {
    const row = byDay.get(s.day) ?? {
      day: s.day,
      eventsReceived: 0,
      eventsFailed: 0,
      posTotal: 0,
      salesRecorded: 0,
      salesTotal: 0,
      totalDelta: 0,
      mismatch: true,
    };
    row.salesRecorded = s.salesRecorded;
    row.salesTotal = round2(s.salesTotal);
    byDay.set(s.day, row);
  }

  for (const row of byDay.values()) {
    row.totalDelta = round2(row.posTotal - row.salesTotal);
    row.mismatch =
      row.eventsFailed > 0 ||
      row.eventsReceived !== row.salesRecorded ||
      Math.abs(row.totalDelta) > 0.005;
  }

  return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}
