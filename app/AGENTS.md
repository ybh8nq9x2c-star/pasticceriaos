# app/ — Agent Guide

App Router Next.js 14. **Server Components di default**; le scritture passano da
**Server Actions** (`modules/<x>/actions.ts`), non da route handler custom.

## Route groups = i due workspace + auth + portale

```
app/(auth)/        login, signup            → pubblico (layout dedicato)
app/onboarding/    scelta account_type      → authed, org opzionale
app/auth/callback/ scambio OAuth/magic-link → pubblico
app/(main)/        BAKERY / CUSTOMER        → layout guard: requireCustomerSession()
app/supplier/      SUPPLIER                 → layout guard: requireSupplierSession()
app/portal/[token] FORNITORE ESTERNO        → JWT nel path, NESSUNA sessione Supabase
app/api/           catalog + customers/orders (route handler REST mirati)
```

**La separazione UI per ruolo è un vincolo di prodotto.** Una pagina bakery vive in
`(main)`, una supplier in `supplier/`. Non mescolare; non condividere pagine tra
workspace bypassando i guard.

## Pattern di pagina (rispettalo)

1. In cima al **layout** del workspace: `await requireCustomerSession()` /
   `requireSupplierSession()` — gira PRIMA di qualsiasi fetch dati (no data leak).
2. Page = Server Component: chiama i `service.ts` del modulo (read), passa props tipizzate.
3. Mutazioni: `<form action={someAction}>` con le action `'use server'` del modulo.
   Niente fetch client-side verso Supabase per scrivere.
4. Stati di caricamento: `loading.tsx` route-level (lo streaming PPR è disattivato su 14.2 stable).

## Portale fornitore (`app/portal/[token]`)

- Auth = **token JWT nel path**, verificato da `lib/supplier-token.ts` / `modules/portal`.
  Il `middleware.ts` fa **early-return** su `/portal*` (zero sessione Supabase).
- `next.config.mjs` forza `Cache-Control: no-store` + `noindex` su `/portal/*`: **non rimuovere.**
- Richiede env `SUPPLIER_TOKEN_SECRET` (≥32 char) e `NEXT_PUBLIC_APP_URL` per i link assoluti.

## Anti-pattern

- ❌ Pagina protetta senza guard nel layout del suo workspace.
- ❌ Scritture dirette a Supabase dal client; usa le Server Actions.
- ❌ Voci di navigazione hardcodate nelle pagine: la sorgente è
  [`../components/layout/navConfig.ts`](../components/layout/navConfig.ts).
- ❌ Toccare il gating in `middleware.ts` senza leggere i suoi commenti (RPC binding fragile).

## Validazione

`npm run typecheck && npm run build`. Per i flussi UI: e2e Playwright in `e2e/tests/`
(setup bakery, fornitore, ricezione, mobile, robustezza).
