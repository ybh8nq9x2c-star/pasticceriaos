// =============================================================================
// app/(main)/inventory/batches/page.tsx
// Lotti e scadenze — vista FEFO con ricette suggerite per lo smaltimento.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { getExpiringBatches } from '@/modules/inventory/service';
import { PageHeader } from '@/components/ui/PageHeader';
import { UNIT_SHORT } from '@/lib/utils';

export const metadata: Metadata = { title: 'Lotti e scadenze' };

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function urgencyStyle(days: number): { badge: string; label: string } {
  if (days < 0)  return { badge: 'bg-danger text-white', label: 'SCADUTO' };
  if (days <= 1) return { badge: 'bg-danger-light text-danger', label: days === 0 ? 'scade oggi' : 'scade domani' };
  if (days <= 3) return { badge: 'bg-warning-light text-warning-strong', label: `${days} giorni` };
  return { badge: 'bg-primary-light text-primary-hover', label: `${days} giorni` };
}

export default async function BatchesPage() {
  // Finestra ampia: 30 giorni; l'urgenza è evidenziata per fascia.
  const batches = await getExpiringBatches(30);
  const urgent = batches.filter((b) => b.daysToExpiry <= 3);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Lotti e scadenze"
        subtitle="Tracciabilità HACCP: lotti registrati alla ricezione, consumati in FEFO dalla produzione"
      />

      {batches.length === 0 ? (
        <div className="bg-surface-2 rounded-2xl border border-border p-10 text-center">
          <div className="w-10 h-10 rounded-full bg-success-light flex items-center justify-center mx-auto mb-3">
            <span className="text-success-strong text-lg font-bold">✓</span>
          </div>
          <p className="text-lg font-bold text-ink">Nessun lotto in scadenza nei prossimi 30 giorni</p>
          <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
            I lotti si registrano alla ricezione di un ordine, dalla pagina dell'ordine ricevuto.
          </p>
          <Link href="/orders" className="inline-block mt-3 text-sm font-semibold text-primary hover:underline">
            Vai agli ordini →
          </Link>
        </div>
      ) : (
        <>
          {urgent.length > 0 && (
            <div className="rounded-2xl border border-danger-soft bg-danger-light p-4">
              <p className="text-sm font-semibold text-danger">
                ⚠️ {urgent.length} {urgent.length === 1 ? 'lotto scade' : 'lotti scadono'} entro 3 giorni
              </p>
            </div>
          )}

          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Lotto</th>
                  <th className="text-right px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Residuo</th>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Scadenza</th>
                  <th className="text-left px-6 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wide">Usalo in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {batches.map((b) => {
                  const u = urgencyStyle(b.daysToExpiry);
                  return (
                    <tr key={b.batchId} className={b.daysToExpiry <= 1 ? 'bg-danger-light' : ''}>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-ink">{b.ingredientName}</p>
                        {b.supplierName && <p className="text-xs text-ink-muted">{b.supplierName}</p>}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-ink-muted">{b.lotNumber ?? '—'}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-ink">
                        {b.quantityRemaining} {UNIT_SHORT[b.unit]}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${u.badge}`}>
                          {u.label}
                        </span>
                        <p className="text-xs font-mono text-ink-muted mt-0.5">{fmtDate(b.expiryDate)}</p>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-ink-muted">
                        {b.suggestedRecipes.length > 0
                          ? b.suggestedRecipes.slice(0, 3).join(', ')
                          : 'nessuna ricetta lo usa'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
