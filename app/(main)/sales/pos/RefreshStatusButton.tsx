'use client';

// =============================================================================
// "Ricontrolla stato" — dopo un passo fatto FUORI da BakeryOS (secret sul
// server, scontrino di prova dalla cassa) l'operatore aggiorna il wizard con
// un tap, senza sapere cosa sia un refresh di pagina.
// =============================================================================

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function RefreshStatusButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      data-testid="pos-refresh-status"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset transition-colors disabled:opacity-60 whitespace-nowrap"
    >
      <RefreshCw size={14} aria-hidden="true" className={pending ? 'animate-spin' : ''} />
      {pending ? 'Controllo…' : 'Ricontrolla stato'}
    </button>
  );
}
