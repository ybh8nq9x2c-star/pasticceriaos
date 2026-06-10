'use client';

// =============================================================================
// components/layout/MobileChrome.tsx
// Mobile-only navigation chrome (shown < lg, hidden on desktop where the
// sidebar takes over). One component renders all three mobile surfaces:
//   • a compact sticky top app bar (menu button · title · contextual action)
//   • a slide-in drawer with the full navigation (overlay, focus-trappable)
//   • a fixed bottom tab bar with the primary destinations
// Themed by `variant` so the customer (warm/navy) and supplier (slate/teal)
// workspaces stay visually consistent with their desktop shells.
// No business logic — pure presentation over the shared navConfig.
// =============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/modules/identity/actions';
import {
  CUSTOMER_NAV, CUSTOMER_BOTTOM, SUPPLIER_NAV, SUPPLIER_BOTTOM,
  isActivePath, type NavItem, type NavSection,
} from './navConfig';

type Variant = 'customer' | 'supplier';

const THEME = {
  customer: {
    bar: 'bg-[#1A2B4A] text-white',
    drawer: 'bg-[#1A2B4A] text-white',
    accent: '#C9962A',
    bottomBar: 'bg-white border-t border-[#E5DDD0]',
    bottomActive: 'text-[#1A2B4A]',
    bottomIdle: 'text-[#6B7280]',
    activeChip: 'bg-[#C9962A] text-[#1A2B4A]',
  },
  supplier: {
    bar: 'bg-[#0B131C] text-white',
    drawer: 'bg-[#0B131C] text-white',
    accent: '#14B8A6',
    bottomBar: 'bg-[#0B131C] border-t border-white/10',
    bottomActive: 'text-[#14B8A6]',
    bottomIdle: 'text-white/55',
    activeChip: 'bg-[#14B8A6] text-[#0B131C]',
  },
} as const;

interface MobileChromeProps {
  variant: Variant;
  orgName: string;
  userEmail: string;
  lowStockCount?: number;
}

export function MobileChrome({ variant, orgName, userEmail, lowStockCount = 0 }: MobileChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = THEME[variant];

  const sections: NavSection[] = variant === 'customer'
    ? CUSTOMER_NAV
    : [{ title: 'Fornitore', items: SUPPLIER_NAV }];
  const bottom: NavItem[] = variant === 'customer' ? CUSTOMER_BOTTOM : SUPPLIER_BOTTOM;

  // Close the drawer whenever the route changes (i.e. after a nav tap).
  useEffect(() => { setOpen(false); }, [pathname]);

  // Esc closes the drawer; lock body scroll while it is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    if (open) {
      document.addEventListener('keydown', onKey);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }
  }, [open]);

  const title = currentTitle(pathname, variant);

  return (
    <>
      {/* ── Top app bar (mobile only) ─────────────────────────────────────── */}
      <header
        className={`lg:hidden sticky top-0 z-40 flex items-center gap-2 h-14 px-2 ${t.bar}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Apri il menu"
          aria-expanded={open}
          aria-controls="mobile-drawer"
          className="grid place-items-center w-11 h-11 rounded-lg hover:bg-white/10 active:bg-white/15 shrink-0"
        >
          <span aria-hidden className="text-xl leading-none">☰</span>
        </button>
        <span className="font-playfair text-[17px] font-bold truncate flex-1 leading-none">{title}</span>
        {variant === 'customer' && lowStockCount > 0 && (
          <Link
            href="/inventory"
            aria-label={`${lowStockCount} ingredienti sotto soglia`}
            className="shrink-0 mr-1 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-white/10 text-xs font-semibold"
          >
            <span aria-hidden className="w-2 h-2 rounded-full bg-[#D4512A]" />
            {lowStockCount}
          </Link>
        )}
      </header>

      {/* ── Drawer + overlay ──────────────────────────────────────────────── */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <nav
            id="mobile-drawer"
            aria-label="Menu principale"
            className={`absolute inset-y-0 left-0 w-[82%] max-w-[320px] flex flex-col ${t.drawer} shadow-2xl`}
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10">
              <div className="font-playfair text-lg font-black leading-none">
                Pasticceria<span style={{ color: t.accent }}>OS</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="grid place-items-center w-10 h-10 rounded-lg hover:bg-white/10 text-xl"
              >
                ✕
              </button>
            </div>

            <div className="mx-4 mt-4 mb-1 bg-white/[0.07] rounded-xl px-3.5 py-3 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg grid place-items-center text-sm font-bold shrink-0"
                style={{ background: t.accent, color: '#0B131C' }}
              >
                {orgName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{orgName}</div>
                <div className="text-[11px] text-white/50">
                  {variant === 'supplier' ? 'Workspace fornitore' : 'Workspace'}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {sections.map((section) => (
                <div key={section.title} className="mb-1">
                  <p className="text-[9px] font-semibold uppercase tracking-[2px] text-white/40 px-3 pt-3 pb-1.5">
                    {section.title}
                  </p>
                  {section.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 px-3 rounded-[10px] text-[15px] font-medium mb-0.5 min-h-[46px] ${
                          active ? `${t.activeChip} font-semibold` : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span aria-hidden className="text-[18px] w-6 text-center">{item.emoji}</span>
                        <span className="truncate">{item.label}</span>
                        {item.href === '/inventory' && lowStockCount > 0 && (
                          <span className="ml-auto bg-[#D4512A] text-white text-[10px] font-bold rounded-full px-1.5 py-px min-w-[18px] text-center">
                            {lowStockCount > 99 ? '99+' : lowStockCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0"
                style={{ background: t.accent, color: '#0B131C' }}
              >
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 truncate text-white/60 text-xs">{userEmail}</span>
              <form action={signOutAction}>
                <button type="submit" className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold">
                  Esci
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}

      {/* ── Bottom tab bar ────────────────────────────────────────────────── */}
      <nav
        aria-label="Navigazione rapida"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 grid ${t.bottomBar}`}
        style={{
          gridTemplateColumns: `repeat(${bottom.length + (variant === 'customer' ? 1 : 0)}, minmax(0, 1fr))`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {bottom.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[10px] font-medium ${
                active ? t.bottomActive : t.bottomIdle
              }`}
            >
              <span aria-hidden className="text-[19px] leading-none">{item.emoji}</span>
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
        {variant === 'customer' && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Apri il menu"
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[10px] font-medium ${t.bottomIdle}`}
          >
            <span aria-hidden className="text-[19px] leading-none">☰</span>
            <span className="leading-none">Menu</span>
          </button>
        )}
      </nav>
    </>
  );
}

// Best-effort section title for the top bar, from the active nav entry.
function currentTitle(pathname: string, variant: Variant): string {
  const all: NavItem[] = variant === 'customer'
    ? CUSTOMER_NAV.flatMap((s) => s.items)
    : SUPPLIER_NAV;
  const match = all
    .filter((i) => isActivePath(pathname, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.label;
  if (pathname.startsWith('/marketplace')) return 'Marketplace';
  if (pathname.startsWith('/supplier')) return 'Fornitore';
  return 'PasticceriaOS';
}
