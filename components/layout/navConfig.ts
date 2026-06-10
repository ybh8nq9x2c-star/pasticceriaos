// =============================================================================
// components/layout/navConfig.ts
// Single source of truth for navigation, shared by the desktop sidebars and the
// mobile chrome (drawer + bottom bar) so the two never drift. Pure data, no JSX.
// =============================================================================

export type NavItem = { href: string; label: string; emoji: string };
export type NavSection = { title: string; items: NavItem[] };

// ── Customer workspace (route group `(main)`) ────────────────────────────────
// Navigazione orientata ai FLUSSI: il marketplace non è più una sezione
// separata — è assorbito nell'hub Fornitori.
export const CUSTOMER_NAV: NavSection[] = [
  {
    title: 'Operativo',
    items: [
      { href: '/dashboard',  label: 'Oggi',           emoji: '☀️' },
      { href: '/production', label: 'Produzione',     emoji: '🧮' },
      { href: '/customers',  label: 'Ordini clienti', emoji: '🎂' },
      { href: '/recipes',    label: 'Ricette',        emoji: '📖' },
    ],
  },
  {
    title: 'Approvvigionamento',
    items: [
      { href: '/suppliers',   label: 'Fornitori',   emoji: '🤝' },
      { href: '/orders',      label: 'Ordini',      emoji: '🛒' },
      { href: '/documents',   label: 'Documenti',   emoji: '🧾' },
      { href: '/inventory',   label: 'Magazzino',   emoji: '📦' },
      { href: '/ingredients', label: 'Ingredienti', emoji: '🧂' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/analytics', label: 'Analisi',      emoji: '📊' },
      { href: '/settings',  label: 'Impostazioni', emoji: '⚙️' },
    ],
  },
];

// 4 primary destinations for the mobile bottom bar; the 4th slot is the drawer.
export const CUSTOMER_BOTTOM: NavItem[] = [
  { href: '/dashboard',  label: 'Oggi',       emoji: '☀️' },
  { href: '/production', label: 'Produzione', emoji: '🧮' },
  { href: '/inventory',  label: 'Magazzino',  emoji: '📦' },
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
