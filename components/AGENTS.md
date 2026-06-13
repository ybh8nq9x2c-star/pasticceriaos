# components/ — Agent Guide

Design system BakeryOs + componenti di dominio. **Mobile + desktop sono entrambi
first-class** (vincolo di prodotto): ogni componente deve reggere su entrambi.

## Struttura

```
ui/        Design system riutilizzabile (Button, Card, Modal, BottomSheet, DataTable,
           PageHeader, Toast, Stepper, StatusBadge, EmptyState, Skeleton…).
           ← USA QUESTI. Non reinventare bottoni/card/modali ad-hoc.
layout/    AppSidebar, AppTopbar, MobileChrome, OrgBadge, navConfig.ts
shared/    Cross-workspace: ConfirmDialog, Logo, NotificationBell, ThemeToggle, UserAvatar
marketplace/, receipts/, suppliers/   Componenti specifici di dominio (client where needed)
```

## Regole

- **Navigazione = `layout/navConfig.ts`** è l'unica fonte di verità (sidebar, topbar/
  breadcrumb, bottom-nav mobile, per entrambi i workspace). Aggiungi voci lì, non nelle pagine.
- **Icone: solo `lucide-react`** (parte del design system). Niente SVG inline ad-hoc o altre librerie.
- **Server vs client**: i componenti sono Server Component salvo necessità (`'use client'`
  solo per stato/interattività — es. `useFormState` nelle form delle action).
- **Mobile**: `MobileChrome` + `BottomSheet` + bottom-nav sono il pattern mobile. Verifica i
  layout su viewport stretto; vedi `MOBILE_QA_CHECKLIST.md` in root.
- **Styling**: Tailwind con i token del tema (`tailwind.config.ts`). Usa classi semantiche
  esistenti (`bg-success-light`, `text-ink-muted`, …) invece di colori hardcodati.

## Anti-pattern

- ❌ Duplicare un componente `ui/` con varianti locali: estendi quello esistente via props.
- ❌ Voci di menu / rotte hardcodate fuori da `navConfig.ts`.
- ❌ Colori/spaziature magiche invece dei token Tailwind del design system.
- ❌ `'use client'` su componenti che non hanno bisogno di interattività.

> ⚠️ In `components/marketplace/` esistono file `.fuse_hidden*`: artefatti di
> filesystem, non sorgenti. Ignorali (e valuta di rimuoverli).

## Validazione

`npm run typecheck`. UI/mobile: e2e `e2e/tests/60-faseF-mobile.spec.ts` + checklist mobile.
