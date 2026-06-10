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
  { href: '/supplier',           label: 'Ordini in arrivo',  emoji: '📥' },
  { href: '/supplier/customers', label: 'Clienti collegati', emoji: '🤝' },
  { href: '/supplier/catalog',   label: 'Catalogo',          emoji: '📦' },
  { href: '/supplier/keys',      label: 'Chiavi di accesso', emoji: '🔑' },
];

// All four fit a bottom bar directly (no overflow drawer needed).
export const SUPPLIER_BOTTOM: NavItem[] = [
  { href: '/supplier',           label: 'Ordini',   emoji: '📥' },
  { href: '/supplier/customers', label: 'Clienti',  emoji: '🤝' },
  { href: '/supplier/catalog',   label: 'Catalogo', emoji: '📦' },
  { href: '/supplier/keys',      label: 'Chiavi',   emoji: '🔑' },
];

/** Longest-prefix active match (shared by every nav surface). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}
