// =============================================================================
// lib/activation.ts — checklist di attivazione GIORNO 1 (logica pura).
// Il sistema nuovo sembra "calmo" ma è vuoto: senza soglie niente alert, senza
// prezzi niente food cost, senza mappature il POS non scala. Questa checklist
// rende visibile COSA caricare e COSA si sblocca — niente tour invadenti:
// sparisce da sola quando tutto è attivo.
// =============================================================================

export interface ActivationCounts {
  ingredients: number;
  ingredientsWithThreshold: number;
  ingredientsWithPrice: number;
  recipes: number;
  completedReceipts: number;
  completedPlans: number;
  posReady: boolean;
  posConfigured: boolean;
}

export interface ActivationTask {
  key: string;
  title: string;
  /** Cosa si SBLOCCA facendolo (valore operativo, non feature). */
  unlocks: string;
  href: string;
  done: boolean;
}

export function buildActivationTasks(c: ActivationCounts): { tasks: ActivationTask[]; pct: number } {
  const tasks: ActivationTask[] = [
    {
      key: 'ingredients',
      title: 'Carica i tuoi ingredienti',
      unlocks: 'Senza ingredienti niente ricette, ordini né magazzino.',
      href: '/ingredients/new',
      done: c.ingredients > 0,
    },
    {
      key: 'thresholds',
      title: 'Imposta le scorte minime',
      unlocks: 'Senza soglie il magazzino non ti avvisa MAI quando stai per restare senza.',
      href: '/inventory',
      done: c.ingredients > 0 && c.ingredientsWithThreshold > 0,
    },
    {
      key: 'prices',
      title: 'Metti i prezzi d’acquisto',
      unlocks: 'Senza prezzi il food cost delle ricette resta vuoto.',
      href: '/ingredients',
      done: c.ingredientsWithPrice > 0,
    },
    {
      key: 'recipes',
      title: 'Crea le ricette (o importale)',
      unlocks: 'Le ricette collegano produzione, banco e costi.',
      href: '/recipes/import',
      done: c.recipes > 0,
    },
    {
      key: 'first-flow',
      title: 'Primo ricevimento o prima produzione',
      unlocks: 'Il primo movimento vero: da qui i numeri iniziano a contare.',
      href: '/receipts/new',
      done: c.completedReceipts > 0 || c.completedPlans > 0,
    },
    {
      key: 'pos',
      title: 'Collega la cassa (se ce l’hai)',
      unlocks: 'Ogni scontrino entrerà da solo e scalerà il banco.',
      href: '/sales/pos',
      // Considerata "fatta" anche se hanno solo iniziato la config: non tutti hanno un POS.
      done: c.posReady || c.posConfigured,
    },
  ];
  const done = tasks.filter((t) => t.done).length;
  return { tasks, pct: Math.round((done / tasks.length) * 100) };
}
