'use client';

// =============================================================================
// <AppTopbar> — barra contestuale desktop (≥lg), 48px.
// Sinistra: breadcrumb testuale (sezione / pagina) dalla navConfig.
// Destra: notifiche (alert reali), tema, CTA contestuale del workspace.
// Su mobile è nascosta: la navigazione vive in <MobileChrome>.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import {
  CUSTOMER_NAV,
  SUPPLIER_NAV,
  activeNavItem,
  sectionOf,
} from './navConfig';

interface AppTopbarProps {
  variant?: 'customer' | 'supplier';
  /** Conteggio alert reali (scorte sotto soglia) per la campanella. */
  lowStockCount?: number;
}

export function AppTopbar({ variant = 'customer', lowStockCount = 0 }: AppTopbarProps) {
  const pathname = usePathname();
  const sections = variant === 'customer' ? CUSTOMER_NAV : SUPPLIER_NAV;
  const item = activeNavItem(pathname, sections);
  const section = item ? sectionOf(item, sections) : null;
  const label =
    item?.label ??
    (pathname.startsWith('/marketplace') ? 'Marketplace' : 'BakeryOs');

  return (
    <header className="hidden lg:flex sticky top-0 z-40 h-12 items-center justify-between gap-4 px-6 bg-bg border-b border-divider">
      {/* Breadcrumb */}
      <nav aria-label="Percorso" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm text-ink-muted">
          {section && (
            <>
              <li className="truncate">{section}</li>
              <li aria-hidden="true" className="text-ink-faint">/</li>
            </>
          )}
          <li aria-current="page" className="font-medium text-ink truncate">
            {label}
          </li>
        </ol>
      </nav>

      {/* Azioni */}
      <div className="flex items-center gap-1.5 shrink-0">
        {variant === 'customer' && (
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} aria-hidden="true" />
            Nuovo ordine
          </Link>
        )}
        <NotificationBell
          count={lowStockCount}
          href={variant === 'customer' ? '/inventory' : '/supplier/orders'}
          label={
            variant === 'customer'
              ? `${lowStockCount} ingredienti sotto soglia`
              : `${lowStockCount} ordini da evadere`
          }
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
