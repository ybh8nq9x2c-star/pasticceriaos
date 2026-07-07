// =============================================================================
// modules/pos/status.ts — derivazione PURA dello stato operativo POS.
// Un solo posto che risponde a "il POS sta funzionando davvero?" e "qual è
// l'unica azione giusta adesso?". Usato dalla card stato (hub vendite) e dal
// wizard /sales/pos. Niente I/O: unit-testabile.
// =============================================================================

import type { BadgeVariant } from '@/components/ui/Badge';

/** Fotografia composta da getPosHealth() (service): stato + contatori. */
export interface PosHealthSnapshot {
  adapterRegistered: boolean;
  webhookSecretConfigured: boolean;
  configActive: boolean;
  storeConfigured: boolean;
  mappingsCount: number;
  processedEventsCount: number;
  /** Prodotti POS visti in vendita ma senza mappatura. */
  unmappedCount: number;
  /** Eventi POS in stato failed (da riprovare). */
  failedCount: number;
}

export type PosOperationalState =
  | 'setup'    // manca il collegamento (config/store/secret/adapter)
  | 'test'     // collegato ma nessun evento mai elaborato: serve la prova
  | 'failed'   // eventi falliti da riprovare
  | 'unmapped' // funziona ma ci sono prodotti non collegati
  | 'live';    // tracking attivo, nessuna azione richiesta

export interface PosCta {
  state: PosOperationalState;
  badge: { label: string; variant: BadgeVariant };
  /** L'UNICA azione primaria contestuale. */
  cta: { label: string; href: string };
  /** Frase di stato onesta per l'operatore. */
  headline: string;
}

/**
 * Priorità: prima COLLEGARE, poi FAR FUNZIONARE (falliti bloccano il flusso),
 * poi COMPLETARE (mappature), poi PROVARE, infine "tutto ok".
 */
export function derivePosCta(s: PosHealthSnapshot): PosCta {
  const connected =
    s.adapterRegistered && s.webhookSecretConfigured && s.configActive && s.storeConfigured;

  if (!connected) {
    return {
      state: 'setup',
      badge: { label: 'Non collegato', variant: 'neutral' },
      cta: { label: 'Collega il POS', href: '/sales/pos' },
      headline: 'La cassa non è ancora collegata: le vendite POS non arrivano.',
    };
  }
  if (s.failedCount > 0) {
    return {
      state: 'failed',
      badge: { label: `${s.failedCount} fallit${s.failedCount === 1 ? 'o' : 'i'}`, variant: 'danger' },
      cta: { label: 'Riprova gli eventi falliti', href: '/sales/inbox?tab=failed' },
      headline: `${s.failedCount} scontrin${s.failedCount === 1 ? 'o non è stato' : 'i non sono stati'} registrat${s.failedCount === 1 ? 'o' : 'i'}: risolvili dall'inbox.`,
    };
  }
  if (s.unmappedCount > 0) {
    return {
      state: 'unmapped',
      badge: { label: `${s.unmappedCount} da collegare`, variant: 'warning' },
      cta: { label: 'Completa la mappatura', href: '/sales/pos#mappatura' },
      headline: `Il POS funziona, ma ${s.unmappedCount} prodott${s.unmappedCount === 1 ? 'o venduto non scala' : 'i venduti non scalano'} il magazzino.`,
    };
  }
  if (s.processedEventsCount === 0) {
    return {
      state: 'test',
      badge: { label: 'In collaudo', variant: 'warning' },
      cta: { label: 'Fai uno scontrino di prova', href: '/sales/pos#prova' },
      headline: 'Collegamento pronto: manca solo il primo scontrino di prova.',
    };
  }
  return {
    state: 'live',
    badge: { label: 'Attivo', variant: 'success' },
    cta: { label: 'Apri inbox POS', href: '/sales/inbox' },
    headline: 'Ogni scontrino entra in BakeryOS e scala i prodotti finiti.',
  };
}
