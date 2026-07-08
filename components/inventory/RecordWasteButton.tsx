'use client';

// =============================================================================
// <RecordWasteButton> — invenduto/scarto PRODOTTI FINITI in un tap (P0-3).
// Vive accanto alla rimanenza teorica: l'operatore vede "ne restano 5" e li
// butta da lì. Quantità prefillata con la rimanenza, motivo a chip, conferma
// immediata. Scrive SOLO sul ledger finiti (mai materie prime).
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { recordFinishedGoodsWasteAction } from '@/modules/inventory/actions';
import { WASTE_REASONS } from '@/modules/inventory/schemas';
import { IDLE_STATE } from '@/lib/utils';

export function RecordWasteButton({
  recipeId,
  productName,
  suggestedQty,
}: {
  recipeId: string;
  productName: string;
  /** Prefill: la rimanenza teorica corrente (se > 0). */
  suggestedQty: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(suggestedQty > 0 ? String(suggestedQty) : '');
  const [reason, setReason] = useState<(typeof WASTE_REASONS)[number]>('Invenduto');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('recipeId', recipeId);
    fd.set('quantity', qty);
    fd.set('reason', reason);
    const res = await recordFinishedGoodsWasteAction(IDLE_STATE, fd);
    setPending(false);
    if (res.status === 'error') {
      setError(res.error);
    } else {
      setDone(true);
      setOpen(false);
      router.refresh();
    }
  }

  if (done) {
    return <span className="text-xs font-semibold text-success-strong whitespace-nowrap">✓ Registrato</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid={`waste-btn-${recipeId}`}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 min-h-[36px] px-2 text-xs font-semibold text-ink-muted hover:text-danger transition-colors whitespace-nowrap"
      >
        <Trash2 size={13} aria-hidden="true" /> Invenduto
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-bg p-2.5 space-y-2">
      <p className="text-xs font-semibold text-ink">Butto via {productName}:</p>
      <div className="flex items-center gap-2">
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          aria-label={`Quantità di ${productName} da buttare`}
          className="w-20 h-10 rounded-lg border border-border px-2 text-sm font-mono text-center bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-ring"
        />
        <span className="text-xs text-ink-muted">pezzi</span>
        <div className="flex flex-wrap gap-1 ml-auto">
          {WASTE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                reason === r ? 'bg-primary text-primary-fg' : 'border border-border text-ink-muted hover:text-ink'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 h-10 rounded-lg border border-border text-xs font-semibold text-ink hover:bg-surface-offset"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !qty.trim()}
          className="flex-[2] h-10 rounded-lg bg-danger text-white text-xs font-semibold hover:bg-danger-hover disabled:opacity-60"
        >
          {pending ? 'Registro…' : 'Conferma'}
        </button>
      </div>
    </div>
  );
}
