'use client';

// =============================================================================
// <MobileChrome> — chrome di navigazione mobile (< lg), tre superfici:
//   • top bar 52px: logo · titolo pagina · notifiche
//   • bottom tab bar 56px: 4 destinazioni primarie + "Altro" (drawer)
//   • drawer "Altro": navigazione completa + org + esci
// Stessa estetica chiara del desktop (superfici, token, Lucide). Nessun dato
// inventato: i badge mostrano solo conteggi reali ricevuti via props.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';
import { signOutAction } from '@/modules/identity/actions';
import { LogoMark } from '@/components/shared/Logo';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { HelpLauncher } from '@/components/help/HelpLauncher';
import { Badge } from '@/components/ui/Badge';
import {
  CUSTOMER_NAV, CUSTOMER_BOTTOM, SUPPLIER_NAV, SUPPLIER_BOTTOM,
  isActivePath, activeNavItem, type NavItem, type NavSection,
} from './navConfig';
import { cn } from '@/lib/utils';

interface MobileChromeProps {
  variant: 'customer' | 'supplier';
  orgName: string;
  userEmail: string;
  lowStockCount?: number;
}

export function MobileChrome({ variant, orgName, userEmail, lowStockCount = 0 }: MobileChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const sections: NavSection[] = variant === 'customer' ? CUSTOMER_NAV : SUPPLIER_NAV;
  const bottom: NavItem[] = variant === 'customer' ? CUSTOMER_BOTTOM : SUPPLIER_BOTTOM;
  const title = activeNavItem(pathname, sections)?.label
    ?? (pathname.startsWith('/marketplace') ? 'Marketplace' : 'BakeryOs');

  // Chiudi il drawer al cambio rotta (dopo un tap di navigazione).
  useEffect(() => { setOpen(false); }, [pathname]);

  // Esc chiude; scroll body bloccato; focus iniziale sul bottone di chiusura.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* ── Top bar mobile ─────────────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 bg-surface border-b border-border safe-area-pt">
        <div className="flex items-center gap-2 h-[52px] px-3">
          <Link
            href={variant === 'customer' ? '/dashboard' : '/supplier'}
            aria-label="BakeryOs — vai alla dashboard"
            className="inline-flex items-center justify-center w-10 h-10 rounded-md text-ink shrink-0"
          >
            <LogoMark size={24} />
          </Link>
          <h2 className="flex-1 min-w-0 truncate text-md font-semibold text-ink">{title}</h2>
          {variant === 'customer' && <HelpLauncher className="inline-flex items-center justify-center w-10 h-10 rounded-md text-ink-muted hover:text-ink active:bg-surface-offset transition-colors shrink-0" />}
          <NotificationBell
            count={variant === 'customer' ? lowStockCount : 0}
            href={variant === 'customer' ? '/inventory' : '/supplier/orders'}
            label={`${lowStockCount} ingredienti sotto soglia`}
            className="w-10 h-10"
          />
        </div>
      </header>

      {/* ── Drawer "Altro" ─────────────────────────────────────────────────── */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <nav
            id="mobile-drawer"
            aria-label="Menu completo"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] flex flex-col rounded-t-xl bg-surface border-t border-border shadow-lg pb-safe"
            style={{ animation: 'bk-sheet-in 220ms cubic-bezier(0.16,1,0.3,1) both' }}
          >
            <div className="flex items-center justify-between pl-4 pr-2 pt-3 pb-2">
              <span className="inline-flex items-center gap-2 text-ink">
                <LogoMark size={20} />
                <span className="text-md font-semibold">BakeryOs</span>
              </span>
              <div className="flex items-center gap-1">
                <ThemeToggle className="w-10 h-10" />
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Chiudi il menu"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-md text-ink-muted hover:bg-surface-offset"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-2">
              {sections.map((section) => (
                <div key={section.title} className="mb-2">
                  <p className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                    {section.title}
                  </p>
                  <ul>
                    {section.items.map((item) => {
                      const active = isActivePath(pathname, item.href);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-3 min-h-[44px] px-3 rounded-md text-md',
                              active
                                ? 'bg-primary-light text-primary font-medium'
                                : 'text-ink hover:bg-surface-offset',
                            )}
                          >
                            <Icon size={18} aria-hidden="true" className="shrink-0" />
                            <span className="truncate">{item.label}</span>
                            {item.href === '/inventory' && lowStockCount > 0 && (
                              <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-danger-fg text-xs font-semibold">
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
            </div>

            <div className="flex items-center gap-3 px-4 py-3 border-t border-divider">
              <span
                aria-hidden="true"
                className="flex items-center justify-center w-9 h-9 rounded-md bg-primary-light text-primary text-sm font-semibold shrink-0"
              >
                {(orgName.trim().charAt(0) || '?').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink truncate">{orgName}</span>
                <span className="flex items-center gap-2 mt-0.5">
                  <Badge variant="primary" size="sm">
                    {variant === 'customer' ? 'Pasticceria' : 'Fornitore'}
                  </Badge>
                  <span className="text-xs text-ink-faint truncate">{userEmail}</span>
                </span>
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  aria-label="Esci dall'account"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-md border border-border text-sm font-medium text-ink-muted hover:text-danger hover:bg-danger-light transition-colors"
                >
                  <LogOut size={14} aria-hidden="true" />
                  Esci
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}

      {/* ── Bottom tab bar ─────────────────────────────────────────────────── */}
      <nav
        aria-label="Navigazione rapida"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border pb-safe"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${bottom.length + 1}, minmax(0, 1fr))` }}
        >
          {bottom.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const showBadge = item.href === '/inventory' && lowStockCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 min-h-[56px] text-xs font-medium',
                  active ? 'text-primary' : 'text-ink-faint',
                )}
              >
                <span className="relative inline-flex">
                  <Icon size={22} aria-hidden="true" />
                  {showBadge && (
                    <span
                      aria-label={`${lowStockCount} alert`}
                      className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-danger text-danger-fg text-xs font-semibold leading-none"
                    >
                      {lowStockCount > 9 ? '9+' : lowStockCount}
                    </span>
                  )}
                </span>
                <span className="leading-none">{item.label}</span>
                {active && (
                  <span aria-hidden="true" className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Apri il menu completo"
            aria-expanded={open}
            aria-controls="mobile-drawer"
            className="flex flex-col items-center justify-center gap-1 min-h-[56px] text-xs font-medium text-ink-faint"
          >
            <Menu size={22} aria-hidden="true" />
            <span className="leading-none">Altro</span>
          </button>
        </div>
      </nav>
    </>
  );
}
