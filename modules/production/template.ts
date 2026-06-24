// =============================================================================
// modules/production/template.ts
// Logica PURA dell'applicazione "settimana tipo" → giorni. Nessun DB. Dato il
// template per giorno-settimana e una data base, calcola i giorni candidati dei
// PROSSIMI 7 giorni (ogni weekday una volta, niente passato, solo i giorni con
// righe nel template). Il filtro "salta i giorni già pianificati" lo fa il service
// con le date esistenti dal DB.
// =============================================================================

const pad = (n: number) => String(n).padStart(2, '0');

/** Data locale → 'YYYY-MM-DD' (plan_date è DATE senza timezone). */
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface ApplyCandidate {
  date: string; // YYYY-MM-DD
  weekday: number; // 0=domenica … 6=sabato
  items: { recipeId: string; batchCount: number }[];
}

/**
 * Prossimi 7 giorni a partire da `base` (incluso): per ogni giorno con righe nel
 * template restituisce un candidato. Giorni senza righe → esclusi. Ogni giorno
 * della settimana compare al più una volta nei 7 giorni.
 */
export function computeApplyCandidates(
  byWeekday: Map<number, { recipeId: string; batchCount: number }[]>,
  base: Date,
): ApplyCandidate[] {
  const out: ApplyCandidate[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const weekday = d.getDay();
    const items = byWeekday.get(weekday);
    if (items && items.length > 0) {
      out.push({ date: isoDate(d), weekday, items: items.map((x) => ({ ...x })) });
    }
  }
  return out;
}
