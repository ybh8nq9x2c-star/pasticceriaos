'use client';

// =============================================================================
// <OrdersBulkSend> — invio massivo di bozze d'ordine (grammatica bulk unica).
// Riceve gli ordini SELEZIONATI dal parent (desktop/mobile), mostra la
// BulkActionBar sticky + un dialog di conferma che elenca DAVVERO cosa parte
// (quanti ordini, quali fornitori) e, dopo l'invio, l'esito ONESTO per esito:
// recapitati / da completare a mano / non elaborati. Mai un "✓ inviati" gonfiato.
// =============================================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { sendOrdersBulkAction, type BulkSendResult } from '@/modules/ordering/actions';

export interface BulkSendableOrder {
  id: string;
  supplierName: string;
}

export function OrdersBulkSend({
  selected,
  onClear,
}: {
  selected: BulkSendableOrder[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BulkSendResult | null>(null);

  // Fornitori coinvolti (con conteggio) per rendere la conferma non-cieca.
  const bySupplier = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of selected) m.set(o.supplierName, (m.get(o.supplierName) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [selected]);

  // Mappa id→fornitore per etichettare l'esito per-ordine.
  const nameById = useMemo(() => new Map(selected.map((o) => [o.id, o.supplierName])), [selected]);

  const n = selected.length;

  async function confirmSend() {
    setPending(true);
    const res = await sendOrdersBulkAction(selected.map((o) => o.id));
    setPending(false);
    setConfirmOpen(false);
    setResult(res);
    router.refresh(); // le bozze inviate escono dalla lista; l'esito resta nel dialog
  }

  function closeResult() {
    setResult(null);
    onClear();
  }

  return (
    <>
      <BulkActionBar count={n} onClear={onClear}>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
        >
          <Send size={15} aria-hidden="true" /> Invia selezionate
        </button>
      </BulkActionBar>

      {/* Dialog CONFERMA — nessun invio cieco: elenca ordini e fornitori. */}
      <Modal
        open={confirmOpen}
        onClose={() => !pending && setConfirmOpen(false)}
        title={`Inviare ${n} ordin${n === 1 ? 'e' : 'i'}?`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-surface-offset disabled:opacity-60"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={confirmSend}
              disabled={pending}
              className="px-4 py-2.5 rounded-xl bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? 'Invio…' : `Invia ${n} ordin${n === 1 ? 'e' : 'i'}`}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink">
          Verranno inviati <strong>davvero</strong> ai fornitori, nel canale configurato
          (email / portale). Quelli non recapitabili dal sistema restano{' '}
          <strong>“da completare a mano”</strong> — te lo dico subito dopo, senza fingere.
        </p>
        <ul className="mt-3 divide-y divide-divider rounded-xl border border-border">
          {bySupplier.map(([name, count]) => (
            <li key={name} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium text-ink">{name}</span>
              <span className="font-mono text-xs text-ink-muted">{count} ordin{count === 1 ? 'e' : 'i'}</span>
            </li>
          ))}
        </ul>
      </Modal>

      {/* Dialog ESITO — onesto per categoria. */}
      <Modal
        open={result !== null}
        onClose={closeResult}
        title="Esito invio"
        footer={
          <button
            type="button"
            onClick={closeResult}
            className="px-4 py-2.5 rounded-xl bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            Chiudi
          </button>
        }
      >
        {result && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-ink">{result.message}</p>

            {result.delivered > 0 && (
              <p className="flex items-center gap-2 text-success-strong">
                <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
                {result.delivered} recapitat{result.delivered === 1 ? 'o' : 'i'} al fornitore.
              </p>
            )}

            {result.manual > 0 && (
              <div className="rounded-xl bg-warning-light border border-warning-soft p-3 text-warning-strong">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
                  {result.manual} passat{result.manual === 1 ? 'o' : 'i'} a “inviato” ma da completare a mano.
                </p>
                <p className="mt-1 text-xs">
                  Il sistema non ha potuto recapitarli (nessun canale attivo). Aprili e inviali tu al fornitore.
                </p>
              </div>
            )}

            {result.errored > 0 && (
              <div className="rounded-xl bg-danger-light border border-danger-soft p-3 text-danger">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
                  {result.errored} non elaborat{result.errored === 1 ? 'o' : 'i'} (restano bozza).
                </p>
                <ul className="mt-1.5 space-y-1 text-xs">
                  {result.results
                    .filter((r) => r.outcome === 'error')
                    .map((r) => (
                      <li key={r.orderId}>
                        <Link href={`/orders/${r.orderId}`} className="underline font-medium">
                          {nameById.get(r.orderId) ?? r.orderId}
                        </Link>
                        {r.error ? ` — ${r.error}` : ''}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
