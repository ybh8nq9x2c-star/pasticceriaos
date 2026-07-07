// =============================================================================
// components/sales/PosStatusCard.tsx — "il POS sta funzionando davvero?"
// Una card, una risposta, UNA azione contestuale. Dati da getPosHealth();
// la logica di verità sta in modules/pos/status.ts (pura, testata).
// =============================================================================

import Link from 'next/link';
import { Plug } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { PosHealth } from '@/modules/pos/service';

function fmt(iso: string | null): string {
  if (!iso) return 'mai';
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function PosStatusCard({ health }: { health: PosHealth }) {
  const { cta, badge } = health.cta;

  return (
    <section
      aria-label="Stato POS"
      className="rounded-2xl border border-border bg-surface-2 p-4 sm:p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center shrink-0">
          <Plug className="size-4 text-primary" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-ink">Cassa (POS)</h2>
            <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">{health.cta.headline}</p>
        </div>
      </div>

      {/* Fatti, non promesse: ultimo evento, ultimo elaborato, contatori. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-4">
        <div>
          <dt className="text-ink-faint">Ultimo evento</dt>
          <dd className="font-mono text-ink">{fmt(health.lastEventAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Ultimo elaborato</dt>
          <dd className="font-mono text-ink">{fmt(health.lastProcessedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Da collegare</dt>
          <dd className={`font-mono ${health.unmappedCount > 0 ? 'text-warning-strong font-semibold' : 'text-ink'}`}>
            {health.unmappedCount}
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Errori recenti</dt>
          <dd className={`font-mono ${health.failedCount > 0 ? 'text-danger font-semibold' : 'text-ink'}`}>
            {health.failedCount}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={cta.href}
          className="inline-flex items-center justify-center min-h-[40px] rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
        >
          {cta.label}
        </Link>
        {health.cta.state !== 'live' && health.cta.state !== 'setup' && (
          <Link href="/sales/inbox" className="text-xs font-semibold text-primary hover:underline px-1">
            Inbox eventi →
          </Link>
        )}
      </div>
    </section>
  );
}
