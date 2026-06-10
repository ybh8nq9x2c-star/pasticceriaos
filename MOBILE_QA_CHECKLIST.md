# PasticceriaOS — Mobile QA checklist

Responsive/PWA extension of the existing Next.js app. Same codebase, services, RLS,
route guards. Test by resizing devtools (or real devices) at the breakpoints below.

## Breakpoints to verify
- **320px** (small phone, iPhone SE 1st gen)
- **375px** (iPhone SE2/8)
- **390px** (iPhone 12–15)
- **768px** (tablet — table layout returns at `md`)
- **≥1024px** (desktop — `lg`: sidebar shell, must be unchanged)

## Global navigation
- [ ] < lg: desktop sidebars hidden; mobile top bar + bottom tab bar visible.
- [ ] ≥ lg: sidebar + topbar visible; no mobile chrome; **desktop unchanged**.
- [ ] Hamburger (top-left) and "Menu" tab open the drawer; overlay tap, ✕, Esc, and any nav tap close it.
- [ ] Body scroll is locked while the drawer is open.
- [ ] Bottom tab active state matches the current route (customer: Home/Magazzino/Marketplace/Menu; supplier: Ordini/Clienti/Catalogo/Chiavi).
- [ ] Content is never hidden behind the bottom bar (≈96px bottom padding) or notch (safe-area insets).
- [ ] No unintended horizontal scroll at 320px on any in-scope screen.

## Flows (customer)
- [ ] **Onboarding** (`/onboarding`): one column, account-type cards tappable, fields ≥44px, no iOS zoom on focus, submit full-width.
- [ ] **Marketplace suppliers** (`/marketplace/suppliers`): connect form stacks (input over button); supplier rows truncate name, "+ Ordine" stays tappable.
- [ ] **Orders list** (`/marketplace/orders`): card stack < md, table ≥ md; each card tappable to detail.
- [ ] **New order composer** (`/marketplace/orders/new?connection=…`): product cards with large qty inputs; sticky total + "Invia ordine" bar sits **above** the tab bar; decimal keypad on qty.
- [ ] **Order detail** (`/marketplace/orders/[id]`): line items as cards + total; status buttons full-width; history readable.

## Flows (supplier)
- [ ] **Incoming orders** (`/supplier`): card stack < md, table ≥ md.
- [ ] **Connected customers** (`/supplier/customers`): rows truncate; "Attivo" chip visible.
- [ ] **Catalog** (`/supplier/catalog`): add form single column < sm; items as cards with "Disattiva".
- [ ] **Keys** (`/supplier/keys`): generate form stacks; one-time key wraps (`break-all`) and is selectable; keys as cards with "Revoca".

## Edge / guard states
- [ ] **Unauthorized** (`/unauthorized`): centered card, both CTAs full-width.
- [ ] **Login / signup**: centered card; brand panel hidden < lg; inputs 16px (no zoom).
- [ ] **Empty states**: suppliers/orders/catalog/keys "nessun…" messages render inside cards, centered.
- [ ] **Error states**: invalid key, forbidden transition, empty order → inline `role="alert"` message, no layout break.
- [ ] **Wrong-workspace guard**: supplier visiting `/marketplace/*` and customer visiting `/supplier/*` still redirect (server-side; unchanged).

## Accessibility
- [ ] Visible focus ring (gold) on links/buttons/inputs via keyboard.
- [ ] Drawer button has `aria-label`/`aria-expanded`/`aria-controls`; bottom tabs expose `aria-current`.
- [ ] Every input has an associated `<label>` (qty inputs use `sr-only` labels).
- [ ] Pinch-zoom NOT disabled (viewport `maximum-scale=5`).
- [ ] Contrast: gold-on-navy and teal-on-slate chips legible.

## PWA
- [ ] `/manifest.webmanifest` served (standalone, theme `#1A2B4A`, `/icon.svg`).
- [ ] "Add to Home Screen" installs; launches standalone with no browser chrome.
- [ ] `theme-color` tints the mobile status bar.

## Regression (must stay green)
- [ ] `npm run typecheck` · `npm run build` · `npm test` all pass.
- [ ] Desktop ≥ lg pixel-unchanged for sidebar, topbar, tables, forms.
