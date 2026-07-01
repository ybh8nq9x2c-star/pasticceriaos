// =============================================================================
// lib/priority-tasks.ts
// SPRINT 1 MOBILE — "Da fare adesso": logica PURA che decide i (max 2) task
// prioritari mostrati in cima alla dashboard mobile. Centralizzata qui (non
// sparsa nelle pagine) e unit-testata. Priorità, dal più urgente:
//   1. ingredienti sotto soglia  → "Ordina i mancanti" (bozza ordine prefillata)
//   2. ordini inviati/parziali   → "Segna l'arrivo"
//   3. piano di oggi mancante o non confermato → crea/completa
// Nessun fetch qui: il chiamante passa dati già caricati.
// =============================================================================

export interface AlertForTask {
  ingredientProductId: string;
  /** Quantità di riordino suggerita (es. 2×soglia − scorta). ≤0 = solo apri form. */
  suggestedQty: number;
}

export interface AwaitingOrderForTask {
  id: string;
  supplierName: string;
}

export interface TodayPlanForTask {
  id: string;
  status: string; // 'draft' | 'in_progress' | 'completed' | ...
}

export type PriorityTaskKind =
  | 'order_missing'
  | 'receive_order'
  | 'complete_plan'
  | 'create_plan';

export interface PriorityTask {
  kind: PriorityTaskKind;
  title: string;
  cta: string;
  href: string;
}

const fmtQty = (n: number): string => String(Math.round(n * 1000) / 1000);

/** Quanti ingredienti al massimo passiamo in query string (URL corto e leggibile). */
const BULK_ORDER_MAX = 20;

/**
 * Href della bozza ordine "tutti i mancanti": /orders/new prefillato con
 * `ingredients=id:qty,id:qty`. Unica fonte di verità per questo link
 * (usata da dashboard e magazzino).
 */
export function buildBulkOrderHref(alerts: AlertForTask[]): string {
  const usable = alerts.filter((a) => a.suggestedQty > 0).slice(0, BULK_ORDER_MAX);
  if (usable.length === 0) return '/orders/new';
  const param = usable
    .map((a) => `${a.ingredientProductId}:${fmtQty(a.suggestedQty)}`)
    .join(',');
  return `/orders/new?ingredients=${encodeURIComponent(param)}`;
}

export function getMobilePriorityTasks(input: {
  alerts: AlertForTask[];
  awaitingOrders: AwaitingOrderForTask[];
  todayPlan: TodayPlanForTask | null;
}): PriorityTask[] {
  const tasks: PriorityTask[] = [];

  // 1 — scorte sotto soglia: porta DRITTO alla bozza ordine prefillata.
  if (input.alerts.length > 0) {
    const n = input.alerts.length;
    tasks.push({
      kind: 'order_missing',
      title: `Ordina ${n} ingredient${n === 1 ? 'e' : 'i'} sotto soglia`,
      cta: 'Ordina',
      href: n <= BULK_ORDER_MAX ? buildBulkOrderHref(input.alerts) : '/inventory',
    });
  }

  // 2 — ordini in attesa di consegna: 1 solo → link diretto al dettaglio.
  if (input.awaitingOrders.length === 1) {
    const o = input.awaitingOrders[0];
    tasks.push({
      kind: 'receive_order',
      title: `Segna l'arrivo dell'ordine da ${o.supplierName}`,
      cta: 'Ricevi',
      href: `/orders/${o.id}`,
    });
  } else if (input.awaitingOrders.length > 1) {
    tasks.push({
      kind: 'receive_order',
      title: `${input.awaitingOrders.length} ordini in arrivo da segnare`,
      cta: 'Ricevi',
      href: '/orders',
    });
  }

  // 3 — piano di oggi: manca → crealo; aperto → completalo. Completato → niente.
  if (!input.todayPlan) {
    tasks.push({
      kind: 'create_plan',
      title: 'Crea il piano di oggi',
      cta: 'Pianifica',
      href: '/production/new',
    });
  } else if (input.todayPlan.status !== 'completed') {
    tasks.push({
      kind: 'complete_plan',
      title: 'Completa il piano di oggi',
      cta: 'Apri',
      href: `/production/${input.todayPlan.id}`,
    });
  }

  // Massimo 2: la sezione deve restare un colpo d'occhio, non una lista.
  return tasks.slice(0, 2);
}
