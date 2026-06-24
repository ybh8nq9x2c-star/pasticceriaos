// =============================================================================
// app/(main)/production/page.tsx
// Lista piani di produzione — Server Component.
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { listPlans } from '@/modules/production/service';
import type { PlanStatus } from '@/modules/production/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChefHat } from 'lucide-react';

export const metadata: Metadata = { title: 'Produzione' };

const STATUS_VARIANT: Record<PlanStatus, 'gray' | 'blue' | 'green' | 'red'> = {
  draft:       'gray',
  in_progress: 'blue',
  completed:   'green',
  cancelled:   'red',
};

const STATUS_LABELS: Record<PlanStatus, string> = {
  draft:       'Bozza',
  in_progress: 'In corso',
  completed:   'Completato',
  cancelled:   'Annullato',
};

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default async function ProductionPage() {
  const plans = await listPlans();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Produzione"
        subtitle={`${plans.length} piano/i`}
        action={
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Link
              href="/production/template"
              className="px-4 py-2.5 bg-surface-2 text-ink border border-border rounded-xl text-sm font-semibold hover:bg-surface-offset transition-colors text-center whitespace-nowrap"
            >
              Settimana tipo
            </Link>
            <Link
              href="/production/new"
              className="px-4 py-2.5 bg-primary text-primary-fg rounded-xl text-sm font-semibold hover:bg-primary-hover transition-colors text-center whitespace-nowrap"
            >
              + Nuovo piano
            </Link>
          </div>
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="Nessun piano di produzione"
          description="Pianifica le produzioni giornaliere con ricette e batch."
          ctaHref="/production/new"
          ctaLabel="Crea piano"
        />
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/production/${plan.id}`}
              className="flex items-center gap-4 bg-surface-2 rounded-2xl border border-border p-5 hover:border-primary-soft hover:shadow-[0_4px_24px_rgba(26,43,74,0.08)] transition-all group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-ink group-hover:text-primary">
                    📅 {formatDate(plan.planDate)}
                  </p>
                  <StatusBadge label={STATUS_LABELS[plan.status]} variant={STATUS_VARIANT[plan.status]} />
                </div>
                {plan.notes && (
                  <p className="text-xs text-ink-muted mt-1 truncate">{plan.notes}</p>
                )}
              </div>
              <div className="text-right text-sm shrink-0">
                <p className="font-medium text-ink font-mono">{plan.itemsCount} ricette</p>
                {plan.completedAt && (
                  <p className="text-xs text-success-strong mt-0.5">
                    ✓ {formatDate(plan.completedAt.slice(0, 10))}
                  </p>
                )}
              </div>
              <span className="text-ink-faint group-hover:text-primary text-lg">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
