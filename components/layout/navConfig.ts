// =============================================================================
// components/layout/navConfig.ts
// Single source of truth for navigation, shared by sidebar, topbar (breadcrumb)
// e bottom nav mobile. Icone: esclusivamente Lucide (design system).
// =============================================================================

import type { LucideIcon } from 'lucide-react';
import {
  Home,
  ChefHat,
  BookOpen,
  Truck,
  ShoppingCart,
  FileText,
  Warehouse,
  Wheat,
  BarChart3,
  Settings,
  Inbox,
  Package,
  PackageCheck,
  Users,
  KeyRound,
  Receipt,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavSection = { title: string; items: NavItem[] };

// ── Customer workspace (route group `(main)`) ────────────────────────────────
export const CUSTOMER_NAV: NavSection[] = [
  {
    title: 'Operativo',
    items: [
      { href: '/dashboard',  label: 'Oggi',       icon: Home },
      { href: '/production', label: 'Produzione', icon: ChefHat },
      // UNA sola voce commerciale: l'hub /sales contiene panoramica, ordini
      // cliente (/customers, stesso ambito) e setup POS (/sales/pos).
      { href: '/sales',      label: 'Vendite',    icon: Receipt },
      { href: '/recipes',    label: 'Ricette',    icon: BookOpen },
    ],
  },
  {
    title: 'Approvvigionamento',
    items: [
      { href: '/suppliers',   label: 'Fornitori',   icon: Truck },
      { href: '/orders',      label: 'Ordini',      icon: ShoppingCart },
      { href: '/receipts',    label: 'Ricevimenti', icon: PackageCheck },
      { href: '/documents',   label: 'Documenti',   icon: FileText },
      { href: '/inventory',   label: 'Magazzino',   icon: Warehouse },
      { href: '/ingredients', label: 'Ingredienti', icon: Wheat },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/analytics', label: 'Analytics',    icon: BarChart3 },
      { href: '/settings',  label: 'Impostazioni', icon: Settings },
    ],
  },
];

// Destinazioni primarie bottom nav mobile (la quinta è il drawer "Altro").
export const CUSTOMER_BOTTOM: NavItem[] = [
  { href: '/dashboard',  label: 'Oggi',       icon: Home },
  { href: '/production', label: 'Produzione', icon: ChefHat },
  { href: '/orders',     label: 'Ordini',     icon: ShoppingCart },
  { href: '/inventory',  label: 'Magazzino',  icon: Warehouse },
];

// ── Supplier workspace (`/supplier`) ─────────────────────────────────────────
export const SUPPLIER_NAV: NavSection[] = [
  {
    title: 'Operativo',
    items: [
      { href: '/supplier',           label: 'Dashboard',         icon: Home },
      { href: '/supplier/orders',    label: 'Ordini ricevuti',   icon: Inbox },
      { href: '/supplier/receipts',  label: 'Ricevimenti',       icon: PackageCheck },
      { href: '/supplier/catalog',   label: 'Catalogo & listino', icon: Package },
      { href: '/supplier/customers', label: 'Clienti bakery',    icon: Users },
      { href: '/supplier/analytics', label: 'Analytics',         icon: BarChart3 },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/supplier/keys',     label: 'Chiavi di accesso', icon: KeyRound },
      { href: '/supplier/settings', label: 'Impostazioni',      icon: Settings },
    ],
  },
];

export const SUPPLIER_BOTTOM: NavItem[] = [
  { href: '/supplier',           label: 'Home',     icon: Home },
  { href: '/supplier/orders',    label: 'Ordini',   icon: Inbox },
  { href: '/supplier/catalog',   label: 'Catalogo', icon: Package },
  { href: '/supplier/analytics', label: 'Analytics', icon: BarChart3 },
];

/** Longest-prefix active match (shared by every nav surface). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/supplier') return pathname === href; // home: exact match only
  // Area commerciale unica: /customers (ordini cliente) vive DENTRO "Vendite"
  // (tab dell'hub /sales), quindi tiene accesa la stessa voce di menu.
  if (href === '/sales' && (pathname === '/customers' || pathname.startsWith('/customers/'))) {
    return true;
  }
  return pathname === href || pathname.startsWith(href + '/');
}

/** Voce nav attiva più specifica per il pathname corrente. */
export function activeNavItem(pathname: string, sections: NavSection[]): NavItem | null {
  const all = sections.flatMap((s) => s.items);
  return (
    all
      .filter((i) => isActivePath(pathname, i.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

/** Sezione di appartenenza di una voce (per il breadcrumb). */
export function sectionOf(item: NavItem, sections: NavSection[]): string | null {
  return sections.find((s) => s.items.includes(item))?.title ?? null;
}
