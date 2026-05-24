'use client';

// =============================================================================
// components/layout/AppTopbar.tsx
// Topbar contestuale: titolo sezione + notifiche alert stock.
// Client component per poter leggere usePathname().
// =============================================================================

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const SECTION_LABELS: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/ingredients': 'Ingredienti',
  '/suppliers':   'Fornitori',
  '/recipes':     'Ricette',
  '/production':  'Produzione',
  '/inventory':   'Magazzino',
  '/orders':      'Ordini d\'acquisto',
  '/analytics':   'Analisi',
  '/settings':    'Impostazioni',
};

function getSectionLabel(pathname: string): string {
  // Cerca il prefisso più lungo che corrisponde
  const match = Object.keys(SECTION_LABELS)
    .filter((k) => pathname === k || pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return match ? SECTION_LABELS[match] : 'PasticceriaOS';
}

interface AppTopbarProps {
  lowStockCount?: number;
}

export function AppTopbar({ lowStockCount = 0 }: AppTopbarProps) {
  const pathname = usePathname();
  const label = getSectionLabel(pathname);

  return (
    <div className="h-[60px] bg-white border-b border-[#E5DDD0] px-8 flex items-center justify-between sticky top-0 z-40">
      {/* Sezione corrente */}
      <span className="font-playfair text-[18px] font-bold text-[#1A2B4A] leading-none">
        {label}
      </span>

      {/* Azioni destra */}
      <div className="flex items-center gap-3">
        {lowStockCount > 0 && (
          <Link
            href="/inventory"
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9962A]/10 border border-[#C9962A]/30 text-xs font-semibold text-[#8A6418] hover:bg-[#C9962A]/20 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-[#D4512A] shrink-0" />
            {lowStockCount} sotto soglia
          </Link>
        )}
        <Link
          href="/orders/new"
          className="px-3 py-1.5 rounded-lg bg-[#1A2B4A] text-white text-xs font-semibold hover:bg-[#243660] transition-colors"
        >
          + Ordine
        </Link>
      </div>
    </div>
  );
}
