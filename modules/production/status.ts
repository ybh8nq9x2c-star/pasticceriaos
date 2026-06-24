// =============================================================================
// modules/production/status.ts
// Stato DERIVATO "Da confermare" — automazione SOFT, nessun nuovo stato DB,
// nessun cron, nessun auto-completamento. Un piano nel PASSATO ancora aperto
// (draft/in_progress) è "da confermare": va chiuso ESPLICITAMENTE dall'utente
// (stesso flusso completePlan → production_usage). Puro e testabile.
// =============================================================================

import type { PlanStatus } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Data locale 'YYYY-MM-DD' (plan_date è DATE senza timezone). */
export const localTodayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Piano nel passato e non ancora chiuso → "Da confermare". NON modifica lo stato
 * persistito: è solo un segnale UX/operativo. `planDate` in 'YYYY-MM-DD' (confronto
 * lessicografico = cronologico per le date ISO). `today` iniettabile per i test.
 */
export function isPendingConfirmation(
  planDate: string,
  status: PlanStatus,
  today: string = localTodayIso(),
): boolean {
  return planDate < today && (status === 'draft' || status === 'in_progress');
}
