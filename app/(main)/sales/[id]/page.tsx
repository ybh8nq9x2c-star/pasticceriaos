// =============================================================================
// app/(main)/sales/[id]/page.tsx
// Dettaglio vendita: ogni riga mostra il PRODOTTO POS e la RICETTA (BOM) da cui è
// stato dedotto il magazzino. Rende OVVIO un mapping sbagliato (audit R4): se
// "Cornetto" risulta dedotto da "Tiramisù", l'operatore lo vede subito.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getSale, getSaleLines } from '@/modules/sales/service';
import type { SaleLineStatus } from '@/modules/sales/bom';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

export const metadata: Metadata = { title: 'Dettaglio vendita' };

const LINE_CFG: Record<SaleLineStatus, { variant: BadgeVariant; label: string }> = {
  deducted: { variant: 'success', label: 'Dedotto' },
  unlinked: { variant: 'danger', label: 'Non collegato' },
  no_bom: { variant: 'warning', label: 'Senza ricetta' },
  unit_mismatch: { variant: 'warning', label: 'Unità incompatibile' },
};

const dateFmt = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const [sale, lines] = await Promise.all([getSale(params.id), getSaleLines(params.id)]);
  if (!sale) notFound();

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/sales" className="text-sm text-ink-muted hover:text-ink transition-colors">
          ← Vendite
        </Link>
        <h1 className="text-2xl font-bold text-ink mt-3">
          Scontrino <span className="font-mono">{sale.externalSaleId}</span>
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          {dateFmt.format(new Date(sale.soldAt))} · {sale.source} · {sale.lineCount} righe
        </p>
      </div>

      <p className="text-sm text-ink-muted mb-3">
        Ogni riga indica la <strong>ricetta</strong> da cui è stato scaricato il magazzino. Se non è quella giusta,
        collega il prodotto alla ricetta corretta da <Link href="/sales" className="text-primary underline">Vendite</Link>.
      </p>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-offset text-ink-muted">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Prodotto venduto</th>
              <th className="text-center font-medium px-4 py-2.5">Qtà</th>
              <th className="text-left font-medium px-4 py-2.5">Ricetta (BOM)</th>
              <th className="text-left font-medium px-4 py-2.5">Stato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {lines.map((l) => {
              const cfg = LINE_CFG[l.status] ?? LINE_CFG.unlinked;
              return (
                <tr key={l.id} className="bg-surface-2 align-top">
                  <td className="px-4 py-3">
                    <span className="text-ink">{l.productName}</span>
                    {l.productName !== l.externalProductRef && (
                      <span className="block text-xs text-ink-faint font-mono">{l.externalProductRef}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-ink-muted">{l.quantity}</td>
                  <td className="px-4 py-3">
                    {l.recipeName ? (
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <ArrowRight className="size-3.5 text-ink-faint" aria-hidden="true" />
                        <Link href={`/recipes/${l.recipeId}`} className="font-medium text-primary hover:underline">
                          {l.recipeName}
                        </Link>
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Badge variant="warning" size="sm">Prodotto non collegato</Badge>
                        <Link href="/settings/pos" className="text-xs font-semibold text-primary hover:underline">
                          Collega →
                        </Link>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                    {l.exception && <p className="text-xs text-ink-muted mt-1">{l.exception}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
