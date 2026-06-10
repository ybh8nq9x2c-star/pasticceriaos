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
  if (days < 0)  return { badge: 'bg-[#C0392B] text-white', label: 'SCADUTO' };
  if (days <= 1) return { badge: 'bg-[#C0392B]/10 text-[#C0392B]', label: days === 0 ? 'scade oggi' : 'scade domani' };
  if (days <= 3) return { badge: 'bg-amber-100 text-amber-700', label: `${days} giorni` };
  return { badge: 'bg-[#C9962A]/15 text-[#8A6418]', label: `${days} giorni` };
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
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-10 text-center">
          <div className="w-10 h-10 rounded-full bg-[#27AE60]/15 flex items-center justify-center mx-auto mb-3">
            <span className="text-[#27AE60] text-lg font-bold">✓</span>
          </div>
          <p className="font-playfair text-lg font-bold text-[#1A2B4A]">Nessun lotto in scadenza nei prossimi 30 giorni</p>
          <p className="text-sm text-[#6B7280] mt-1 max-w-md mx-auto">
            I lotti si registrano alla ricezione di un ordine, dalla pagina dell'ordine ricevuto.
          </p>
          <Link href="/orders" className="inline-block mt-3 text-sm font-semibold text-[#C9962A] hover:underline">
            Vai agli ordini →
          </Link>
        </div>
      ) : (
        <>
          {urgent.length > 0 && (
            <div className="rounded-2xl border border-[#C0392B]/30 bg-[#C0392B]/[0.05] p-4">
              <p className="text-sm font-semibold text-[#C0392B]">
                ⚠️ {urgent.length} {urgent.length === 1 ? 'lotto scade' : 'lotti scadono'} entro 3 giorni
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0]">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Ingrediente</th>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Lotto</th>
                  <th className="text-right px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Residuo</th>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Scadenza</th>
                  <th className="text-left px-6 py-3 font-semibold text-[#6B7280] text-xs uppercase tracking-wide">Usalo in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1]">
                {batches.map((b) => {
                  const u = urgencyStyle(b.daysToExpiry);
                  return (
                    <tr key={b.batchId} className={b.daysToExpiry <= 1 ? 'bg-[#C0392B]/[0.03]' : ''}>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-[#1A2B4A]">{b.ingredientName}</p>
                        {b.supplierName && <p className="text-xs text-[#6B7280]">{b.supplierName}</p>}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-[#6B7280]">{b.lotNumber ?? '—'}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[#1A2B4A]">
                        {b.quantityRemaining} {UNIT_SHORT[b.unit]}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.badge}`}>
                          {u.label}
                        </span>
                        <p className="text-xs font-mono text-[#6B7280] mt-0.5">{fmtDate(b.expiryDate)}</p>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-[#6B7280]">
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
