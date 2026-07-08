'use client';

// =============================================================================
// <CompleteProductionButton> — P0-B: il gesto contabile più importante del
// sistema non si fa più al buio. Prima della conferma: riepilogo di cosa
// scala e cosa sale, con la frase chiave del dominio. Nessun auto-complete,
// stessa action idempotente di sempre (completePlanAction → RPC v4).
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { completePlanAction } from '@/modules/production/actions';

export function CompleteProductionButton({
  planId,
  recipeCount,
  totalPortions,
  ingredientCount,
  shortageCount,
  className,
}: {
  planId: string;
  recipeCount: number;
  totalPortions: number;
  ingredientCount: number;
  shortageCount: number;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    const res = await completePlanAction(planId);
    if (res.status === 'error') {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="complete-production"
        className={
          className ??
          'w-full py-3 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors'
        }
      >
        ✓ Conferma produzione eseguita
      </button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confermi la produzione?"
        confirmLabel="Sì, ho prodotto questo"
        confirmVariant="primary"
        onConfirm={confirm}
      >
        <div className="space-y-2 text-sm">
          <p className="text-ink">
            Metti a banco <strong>{totalPortions} pezz{totalPortions === 1 ? 'o' : 'i'}</strong>{' '}
            ({recipeCount} ricett{recipeCount === 1 ? 'a' : 'e'}) e scali{' '}
            <strong>{ingredientCount} ingredient{ingredientCount === 1 ? 'e' : 'i'}</strong> dal magazzino.
          </p>
          {shortageCount > 0 && (
            <p className="rounded-lg bg-warning-light px-3 py-2 text-xs text-warning-strong">
              Attenzione: per {shortageCount} ingredient{shortageCount === 1 ? 'e' : 'i'} la scorta
              registrata non basta — la giacenza andrà sotto zero (si corregge poi con una rettifica,
              ma controlla di non aver saltato un ricevimento).
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Se le infornate reali sono diverse dal piano, prima correggi le quantità nel piano, poi
            conferma. Finché non confermi, il magazzino non sa cosa hai usato né cosa hai prodotto.
          </p>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </div>
      </ConfirmDialog>
    </>
  );
}
