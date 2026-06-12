'use client';

// =============================================================================
// <AppSidebar> — navigazione desktop (≥lg) per entrambi i workspace.
//   • lg (1024–1279px): rail compatta icone-only con tooltip nativo
//   • xl (≥1280px):     sidebar completa 240px con label e sezioni
// Voci e icone arrivano da navConfig (unica fonte di verità). Stato attivo:
// bg-primary-light + testo primary (mai border-left colorato).
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo, LogoMark } from '@/components/shared/Logo';
import { OrgBadge } from '@/components/layout/OrgBadge';
import {
  CUSTOMER_NAV,
  SUPPLIER_NAV,
  isActivePath,
  type NavSection,
} from './navConfig';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  variant?: 'customer' | 'supplier';
  orgName: string;
  userEmail: string;
  /** Alert reali (scorte sotto soglia) mostrati come badge su Magazzino. */
  lowStockCount?: number;
}

export function AppSidebar({
  variant = 'customer',
  orgName,
  userEmail,
  lowStockCount = 0,
}: AppSidebarProps) {
  const pathname = usePathname();
  const sections: NavSection[] = variant === 'customer' ? CUSTOMER_NAV : SUPPLIER_NAV;
  const homeHref = variant === 'customer' ? '/dashboard' : '/supplier';
  const workspaceLabel = variant === 'customer' ? 'Pasticceria' : 'Fornitore';

  return (
    <aside
      aria-label="Navigazione principale"
      className="hidden lg:flex sticky top-0 h-screen w-[68px] xl:w-60 shrink-0 flex-col bg-surface border-r border-border"
    >
      {/* Logo */}
      <div className="flex items-center px-3 xl:px-5 h-14 border-b border-divider shrink-0">
        <Link
          href={homeHref}
          aria-label="BakeryOs — vai alla dashboard"
          className="inline-flex items-center text-ink rounded-md"
        >
          <span className="xl:hidden"><LogoMark size={22} /></span>
          <span className="hidden xl:inline-flex"><Logo size={22} /></span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 xl:px-3 py-3">
        {sections.map((section, idx) => (
          <div key={section.title} className={cn(idx > 0 && 'mt-5')}>
            <p className="hidden xl:block px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                const showBadge = item.href === '/inventory' && lowStockCount > 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 h-9 px-3 rounded-md text-sm transition-colors',
                        'justify-center xl:justify-start',
                        active
                          ? 'bg-primary-light text-primary font-medium'
                          : 'text-ink-muted hover:bg-surface-offset hover:text-ink',
                      )}
                    >
                      <span className="relative inline-flex shrink-0">
                        <Icon size={16} aria-hidden="true" />
                        {showBadge && (
                          <span
                            aria-hidden="true"
                            className="xl:hidden absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-danger"
                          />
                        )}
                      </span>
                      <span className="hidden xl:inline truncate">{item.label}</span>
                      {showBadge && (
                        <span
                          aria-label={`${lowStockCount} ingredienti sotto soglia`}
                          className="hidden xl:inline-flex ml-auto items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-danger text-danger-fg text-xs font-semibold leading-none"
                        >
                          {lowStockCount > 99 ? '99+' : lowStockCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Org badge */}
      <div className="p-2 xl:p-3 border-t border-divider shrink-0">
        <div className="xl:hidden">
          <OrgBadge orgName={orgName} email={userEmail} workspaceLabel={workspaceLabel} collapsed />
        </div>
        <div className="hidden xl:block">
          <OrgBadge orgName={orgName} email={userEmail} workspaceLabel={workspaceLabel} />
        </div>
      </div>
    </aside>
  );
}
