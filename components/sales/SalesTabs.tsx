// =============================================================================
// components/sales/SalesTabs.tsx — sub-nav dell'AREA COMMERCIALE unica.
// Vendite (scontrini, passato) · Ordini cliente (prenotazioni, futuro) · POS.
// Stessa area mentale, motori dati separati (sales / customers / pos).
// =============================================================================

import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'overview', href: '/sales', label: 'Panoramica' },
  { key: 'customers', href: '/customers', label: 'Ordini cliente' },
  { key: 'pos', href: '/sales/pos', label: 'POS' },
] as const;

export type SalesTabKey = (typeof TABS)[number]['key'];

export function SalesTabs({ active }: { active: SalesTabKey }) {
  return (
    <nav aria-label="Sezioni vendite" className="flex gap-1.5 overflow-x-auto -mx-1 px-1 mb-5">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={cn(
            'whitespace-nowrap rounded-full px-3.5 min-h-[36px] inline-flex items-center text-sm border transition-colors',
            t.key === active
              ? 'bg-primary-light text-primary border-primary-soft font-semibold'
              : 'border-border text-ink-muted hover:bg-surface-offset',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
