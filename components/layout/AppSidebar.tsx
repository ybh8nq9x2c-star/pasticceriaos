'use client';

// =============================================================================
// components/layout/AppSidebar.tsx
// Sidebar unificata per il workspace (main).
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/modules/identity/actions';

type NavItem = { href: string; label: string; emoji: string };

const OPERATIVO: NavItem[] = [
  { href: '/dashboard',   label: 'Dashboard',   emoji: '🏠' },
  { href: '/ingredients', label: 'Ingredienti', emoji: '🧂' },
  { href: '/suppliers',   label: 'Fornitori',   emoji: '🤝' },
  { href: '/recipes',     label: 'Ricette',     emoji: '📖' },
  { href: '/production',  label: 'Produzione',  emoji: '🧮' },
];

const GESTIONE: NavItem[] = [
  { href: '/inventory',             label: 'Magazzino',   emoji: '📦' },
  { href: '/orders',                label: 'Ordini',      emoji: '🛒' },
  { href: '/marketplace/suppliers', label: 'Marketplace', emoji: '🔗' },
  { href: '/analytics',             label: 'Analisi',     emoji: '📊' },
];

const SISTEMA: NavItem[] = [
  { href: '/settings', label: 'Impostazioni', emoji: '⚙️' },
];

interface AppSidebarProps {
  orgName: string;
  userEmail: string;
  lowStockCount?: number;
}

export function AppSidebar({ orgName, userEmail, lowStockCount = 0 }: AppSidebarProps) {
  const pathname = usePathname();

  function renderItem({ href, label, emoji }: NavItem) {
    const isActive = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-sm font-medium transition-colors relative mb-0.5 ${
          isActive
            ? 'bg-[#C9962A] text-[#1A2B4A] font-semibold'
            : 'text-white/65 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span className="text-[17px] w-[22px] text-center leading-none">{emoji}</span>
        <span>{label}</span>
        {href === '/inventory' && lowStockCount > 0 && (
          <span className="ml-auto bg-[#D4512A] text-white text-[10px] font-bold rounded-full px-1.5 py-px min-w-[18px] text-center">
            {lowStockCount > 99 ? '99+' : lowStockCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside className="hidden lg:flex w-60 bg-[#1A2B4A] text-white flex-col min-h-screen shrink-0">
      {/* Logo */}
      <div className="px-6 pt-7 pb-5 border-b border-white/[0.08]">
        <div className="font-playfair text-xl font-black tracking-tight leading-none">
          Pasticceria<span className="text-[#F5C842]">OS</span>
        </div>
        <div className="text-[10px] text-[#F5C842] uppercase tracking-[2px] mt-1">
          Sistema Operativo
        </div>
      </div>

      {/* Org badge */}
      <div className="mx-4 mt-4 mb-2 bg-white/[0.07] rounded-xl px-3.5 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#C9962A] flex items-center justify-center text-sm font-bold text-[#1A2B4A] shrink-0">
          {orgName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white truncate">{orgName}</div>
          <div className="text-[11px] text-white/50 truncate">Workspace</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        <p className="text-[9px] font-semibold uppercase tracking-[2px] text-white/40 px-3 pt-3 pb-1.5">
          Operativo
        </p>
        {OPERATIVO.map(renderItem)}

        <p className="text-[9px] font-semibold uppercase tracking-[2px] text-white/40 px-3 pt-4 pb-1.5">
          Gestione
        </p>
        {GESTIONE.map(renderItem)}

        <p className="text-[9px] font-semibold uppercase tracking-[2px] text-white/40 px-3 pt-4 pb-1.5">
          Sistema
        </p>
        {SISTEMA.map(renderItem)}
      </nav>

      {/* Alert strip */}
      {lowStockCount > 0 && (
        <div className="px-4 pb-1">
          <Link
            href="/inventory"
            className="block rounded-[9px] border border-[#C9962A]/30 bg-[#C9962A]/15 px-3 py-2.5 transition-colors hover:bg-[#C9962A]/25"
          >
            <span className="block text-lg font-bold font-mono text-[#F5C842] leading-none">
              {lowStockCount}
            </span>
            <span className="text-[11px] text-[#F5C842]/90">
              ingredient{lowStockCount === 1 ? 'e' : 'i'} sotto soglia
            </span>
          </Link>
        </div>
      )}

      {/* User / Sign out */}
      <div className="px-4 py-4 border-t border-white/[0.08] mt-1">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#C9962A] flex items-center justify-center text-xs font-bold text-[#1A2B4A] shrink-0">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 truncate text-white/60 text-xs">{userEmail}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              title="Esci"
              className="text-white/40 hover:text-white transition-colors"
            >
              ↩
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
