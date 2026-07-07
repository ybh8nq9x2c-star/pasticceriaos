'use client';

// =============================================================================
// app/(main)/sales/pos/DryRunTester.tsx — step "Prova" del wizard.
// Incolla il JSON di uno scontrino (o usa l'esempio) → POST /api/pos/dry-run:
// mostra come verrebbe interpretato SENZA scrivere nulla (zero magazzino).
// La prova vera resta lo scontrino reale dalla cassa; questo toglie l'ansia.
// =============================================================================

import { useState } from 'react';
import type { PosDryRunResult } from '@/modules/pos/service';

const EXAMPLE = JSON.stringify(
  {
    type: 'receipt.created',
    receipt: {
      id: 'TEST-0001',
      store_id: 'store_12345',
      sold_at: new Date().toISOString(),
      total_cents: 450,
      items: [{ sku: 'CORN01', name: 'Cornetto', quantity: 2, unit_price_cents: 150 }],
    },
  },
  null,
  2,
);

export function DryRunTester({ provider = 'mipos' }: { provider?: string }) {
  const [payload, setPayload] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PosDryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const parsed = JSON.parse(payload || EXAMPLE);
      const res = await fetch('/api/pos/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, payload: parsed }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Prova non riuscita.');
      setResult(body.result as PosDryRunResult);
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Il testo incollato non è JSON valido.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder={EXAMPLE}
        rows={7}
        spellCheck={false}
        className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-xs leading-snug focus:outline-none focus:ring-2 focus:ring-primary-ring"
        aria-label="Payload scontrino di prova (JSON)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? 'Verifica…' : payload.trim() ? 'Prova questo scontrino' : 'Prova con l’esempio'}
        </button>
        <span className="text-xs text-ink-muted">Nessuna scrittura: solo interpretazione.</span>
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-light px-3 py-2 text-sm text-danger">{error}</p>}

      {result && (
        <div role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-sm space-y-1.5">
          <p className="font-semibold text-ink">
            Scontrino <span className="font-mono">{result.incoming.external_receipt_id}</span> letto correttamente ✓
          </p>
          <p className="text-ink-muted">
            {result.linesTotal} rig{result.linesTotal === 1 ? 'a' : 'he'} ·{' '}
            <span className={result.linesMapped === result.linesTotal ? 'text-success-strong font-semibold' : ''}>
              {result.linesMapped} collegat{result.linesMapped === 1 ? 'a' : 'e'} a ricette
            </span>
            {result.unlinked.length > 0 && (
              <> · <span className="text-warning-strong font-semibold">{result.unlinked.length} da collegare</span>{' '}
                (<span className="font-mono text-xs">{result.unlinked.join(', ')}</span>)
              </>
            )}
          </p>
          {result.unlinked.length > 0 ? (
            <p className="text-xs text-ink-muted">
              Le righe non collegate verrebbero registrate <strong>senza scalare il magazzino</strong>: mappale
              nella sezione qui sotto prima di andare live.
            </p>
          ) : (
            <p className="text-xs text-success-strong">Tutto collegato: questo scontrino scalerebbe i prodotti finiti.</p>
          )}
        </div>
      )}
    </div>
  );
}
