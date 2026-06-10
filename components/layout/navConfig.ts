// =============================================================================
// components/layout/navConfig.ts
// Single source of truth for navigation, shared by the desktop sidebars and the
// mobile chrome (drawer + bottom bar) so the two never drift. Pure data, no JSX.
// =============================================================================

export type NavItem = { href: string; label: string; emoji: string };
export type NavSection = { title: string; items: NavItem[] };

// ── Customer workspace (route group `(main)`) ────────────────────────────────
export const CUSTOMER_NAV: NavSection[] = [
  {
    title: 'Operativo',
    items: [
      { href: '/dashboard',   label: 'Dashboard',   emoji: '🏠' },
      { href: '/ingredients', label: 'Ingredienti', emoji: '🧂' },
      { href: '/suppliers',   label: 'Fornitori',   emoji: '🤝' },
      { href: '/recipes',     label: 'Ricette',     emoji: '📖' },
      { href: '/production',  label: 'Produzione',  emoji: '🧮' },
    ],
  },
  {
    title: 'Gestione',
    items: [
      { href: '/inventory',             label: 'Magazzino',   emoji: '📦' },
      { href: '/orders',                label: 'Ordini',      emoji: '🛒' },
      { href: '/marketplace/suppliers', label: 'Marketplace', emoji: '🔗' },
      { href: '/analytics',             label: 'Analisi',     emoji: '📊' },
    ],
  },
  {
    title: 'Sistema',
    items: [{ href: '/settings', label: 'Impostazioni', emoji: '⚙️' }],
  },
];

// 4 primary destinations for the mobile bottom bar; the 4th slot is the drawer.
export const CUSTOMER_BOTTOM: NavItem[] = [
  { href: '/dashboard',             label: 'Home',        emoji: '🏠' },
  { href: '/inventory',             label: 'Magazzino',   emoji: '📦' },
  { href: '/marketplace/suppliers', label: 'Marketplace', emoji: '🔗' },
];

// ── Supplier workspace (`/supplier`) ─────────────────────────────────────────
export const SUPPLIER_NAV: NavItem[] = [
  { href: '/supplier',           label: 'Dashboard',         emoji: '🏠' },
  { href: '/supplier/orders',    label: 'Ordini clienti',    emoji: '📥' },
  { href: '/supplier/catalog',   label: 'Catalogo',          emoji: '📦' },
  { href: '/supplier/customers', label: 'Clienti collegati', emoji: '🤝' },
  { href: '/supplier/analytics', label: 'Analisi',           emoji: '📊' },
  { href: '/supplier/keys',      label: 'Chiavi di accesso', emoji: '🔑' },
  { href: '/supplier/settings',  label: 'Impostazioni',      emoji: '⚙️' },
];

// Primary destinations for the mobile bottom bar.
export const SUPPLIER_BOTTOM: NavItem[] = [
  { href: '/supplier',           label: 'Home',     emoji: '🏠' },
  { href: '/supplier/orders',    label: 'Ordini',   emoji: '📥' },
  { href: '/supplier/catalog',   label: 'Catalogo', emoji: '📦' },
  { href: '/supplier/analytics', label: 'Analisi',  emoji: '📊' },
];

/** Longest-prefix active match (shared by every nav surface). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/supplier') return pathname === href; // home: exact match only
  return pathname === href || pathname.startsWith(href + '/');
}
