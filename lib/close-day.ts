// =============================================================================
// lib/close-day.ts — "Chiudi la giornata": logica PURA del rito serale.
// Concatena in UN posto i 4 passi che oggi vivono sparsi (produzione da
// confermare, invenduto, ricevimenti aperti, problemi POS), con la CONSEGUENZA
// pratica accanto a ogni passo — copy da mestiere, non da database.
// Pura = unit-testabile: il dashboard le passa dati già caricati.
// =============================================================================

export interface CloseDayInput {
  /** Piani di produzione non ancora confermati (id, data, porzioni). */
  pendingPlans: { id: string; planDate: string; totalPortions?: number }[];
  /** Righe rimanenza teorica di oggi con resto > 0 (invenduto da registrare). */
  leftoverProducts: { name: string; remaining: number }[];
  /** Ricevimenti ancora aperti con righe (merce fisica non a magazzino). */
  openReceipts: { id: string; supplierName: string | null }[];
  /** Salute POS: eventi falliti + prodotti da collegare. */
  posFailed: number;
  posUnmapped: number;
  /** Ora locale (0–23) per il tono/ordinamento serale. */
  hour: number;
  /** ISO date di oggi (YYYY-MM-DD) per distinguere il piano di oggi dai passati. */
  today: string;
}

export interface CloseDayStep {
  key: 'production' | 'waste' | 'receipts' | 'pos';
  title: string;
  /** Conseguenza pratica se NON lo fai — mai gergo tecnico. */
  consequence: string;
  href: string;
  cta: string;
  count: number;
}

/** Il rito serale inizia alle 17: prima di quell'ora la card non esiste. */
export const EVENING_HOUR = 17;

export function buildCloseDaySteps(input: CloseDayInput): CloseDayStep[] {
  // SOLO serale (review pre-merge): di giorno gli stessi task vivono già in
  // "Richiede attenzione" e "Da fare adesso" — una terza superficie al mattino
  // è rumore, e "Chiudi la giornata" alle 8 non ha senso. Il rito parte alle 17.
  if (input.hour < EVENING_HOUR) return [];

  const steps: CloseDayStep[] = [];

  // 1) Produzione da confermare (di sera include anche il piano di OGGI;
  //    il chiamante passa già solo piani con data <= oggi).
  const plansToConfirm = input.pendingPlans;
  if (plansToConfirm.length > 0) {
    const one = plansToConfirm.length === 1;
    steps.push({
      key: 'production',
      title: one ? 'Conferma la produzione' : `Conferma ${plansToConfirm.length} produzioni`,
      consequence:
        'Finché non confermi, il magazzino non sa cosa hai usato e il banco non sa cosa hai prodotto.',
      href: one ? `/production/${plansToConfirm[0].id}` : '/production',
      cta: 'Conferma',
      count: plansToConfirm.length,
    });
  }

  // 2) Invenduto da registrare.
  if (input.leftoverProducts.length > 0) {
    const pieces = input.leftoverProducts.reduce((s, p) => s + p.remaining, 0);
    steps.push({
      key: 'waste',
      title: `Registra l'invenduto (${pieces} pezz${pieces === 1 ? 'o' : 'i'})`,
      consequence: 'Quello che butti senza registrarlo domani risulterà ancora sul banco.',
      href: '/dashboard#rimanenze',
      cta: 'Registra',
      count: input.leftoverProducts.length,
    });
  }

  // 3) Ricevimenti aperti: merce fisicamente in casa ma non a magazzino.
  if (input.openReceipts.length > 0) {
    const one = input.openReceipts.length === 1;
    steps.push({
      key: 'receipts',
      title: one
        ? `Chiudi il ricevimento di ${input.openReceipts[0].supplierName ?? 'merce'}`
        : `Chiudi ${input.openReceipts.length} ricevimenti aperti`,
      consequence: 'La merce arrivata non conta in magazzino finché il ricevimento non è chiuso.',
      href: '/receipts?tab=open',
      cta: 'Chiudi',
      count: input.openReceipts.length,
    });
  }

  // 4) POS: prima i falliti (scontrini interi persi), poi i non collegati.
  if (input.posFailed > 0) {
    steps.push({
      key: 'pos',
      title: `${input.posFailed} scontrin${input.posFailed === 1 ? 'o' : 'i'} della cassa non registrat${input.posFailed === 1 ? 'o' : 'i'}`,
      consequence: 'Quelle vendite non esistono per il sistema finché non le riprovi.',
      href: '/sales/inbox?tab=failed',
      cta: 'Riprova',
      count: input.posFailed,
    });
  } else if (input.posUnmapped > 0) {
    steps.push({
      key: 'pos',
      title: `${input.posUnmapped} prodott${input.posUnmapped === 1 ? 'o' : 'i'} della cassa da collegare`,
      consequence: 'Le loro vendite non scalano il banco finché non li colleghi.',
      href: '/sales/pos#mappatura',
      cta: 'Collega',
      count: input.posUnmapped,
    });
  }

  return steps;
}
