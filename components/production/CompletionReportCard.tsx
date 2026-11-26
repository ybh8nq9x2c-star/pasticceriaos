// =============================================================================
// components/production/CompletionReportCard.tsx
// Esito DICHIARATO del completamento produzione (RPC v5, migration 060):
// righe saltate (unità incompatibile / ingrediente di altra org), lotti FEFO
// consumati e quota senza lotto. Server Component, solo lettura.
// =============================================================================

import type { PlanCompletionReport } from '@/modules/production/types';

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

const REASON_LABEL: Record<PlanCompletionReport['skipped'][number]['reason'], string> = {
  unit_incompatible: 'unità non convertibile',
  ingredient_other_org: 'ingrediente non di questa organizzazione',
};

export function CompletionReportCard({ report }: { report: PlanCompletionReport }) {
  const incomplete = report.output.filter((o) => !o.ingredientsComplete);
  const withLots = report.consumed.filter((c) => c.lots.length > 0);
  const untracked = report.consumed.filter((c) => c.untrackedQuantity > 0);

  return (
    <div className="space-y-3">
      {report.skipped.length > 0 && (
        <div className="rounded-2xl border border-warning-soft bg-warning-light p-4" role="alert">
          <p className="text-sm font-semibold text-warning-strong">
            Scarico ingredienti incompleto: {report.skipped.length}{' '}
            {report.skipped.length === 1 ? 'riga saltata' : 'righe saltate'}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink">
            {report.skipped.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.recipeName}</span> · {s.ingredientName}{' '}
                {fmt(s.quantity)} {s.recipeUnit} — {REASON_LABEL[s.reason]}
                {s.reason === 'unit_incompatible' ? ` (magazzino in ${s.stockUnit})` : ''}
              </li>
            ))}
          </ul>
          {incomplete.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Prodotti accreditati con consumo incompleto:{' '}
              {incomplete.map((o) => o.recipeName).join(', ')}. Correggi l&apos;unità nella ricetta e
              registra una rettifica di magazzino per l&apos;ingrediente non scaricato.
            </p>
          )}
        </div>
      )}

      {(withLots.length > 0 || untracked.length > 0) && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Lotti consumati (FEFO)</p>
          <ul className="mt-2 space-y-1 text-xs text-ink">
            {withLots.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.ingredientName}</span>:{' '}
                {c.lots
                  .map((l) => `${l.lotNumber ?? 'senza n.'} (scad. ${new Date(l.expiryDate + 'T00:00:00').toLocaleDateString('it-IT')}) ${fmt(l.quantity)} ${l.unit}`)
                  .join(' · ')}
              </li>
            ))}
            {untracked.map((c, i) => (
              <li key={`u${i}`} className="text-ink-muted">
                {c.ingredientName}: {fmt(c.untrackedQuantity)} {c.unit} da stock senza lotto
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
