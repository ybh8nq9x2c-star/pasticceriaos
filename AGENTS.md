# BakeryOs — Agent Guide (root)

> Piattaforma B2B per **pasticcerie (customer/bakery)** e **fornitori (supplier)**:
> stesso prodotto, stesso codebase, due workspace distinti per ruolo.
> Dominio centrale = **magazzino / inventory**. Deploy GitHub → Railway. DB Supabase/Postgres.
>
> Questo file è la mappa d'ingresso. Ogni cartella critica ha un suo `AGENTS.md`
> più specifico — **leggi quello del modulo che tocchi prima di modificare.**

## 0. Regole assolute (non negoziabili)

1. **Ricognizione prima del codice.** Leggi il modulo + il suo AGENTS.md prima di scrivere.
2. **Una sola fonte di verità per lo stock**: la tabella `inventory_movements` (ledger
   append-only). `inventory_levels` è una *proiezione* aggiornata SOLO da trigger DB.
   Mai scrivere `current_quantity` dall'app. Vedi [`modules/inventory/AGENTS.md`](modules/inventory/AGENTS.md).
3. **Non duplicare logica di dominio.** Ogni dominio ha già un modulo (`modules/<x>`).
   Riusa service/repository esistenti; non creare write-path paralleli.
4. **Non rompere la business logic esistente** (transizioni stato, RLS, idempotenza).
5. Ogni modifica si chiude con: **`npm run typecheck` + `npm run test` + `npm run build`** (§5).
6. **Runtime Node 20** obbligatorio (§4). **Sincronizza `package-lock.json`** a ogni
   cambio dipendenze (§4) — è già stato causa di build rotte su Railway.
7. Se trovi un problema strutturale: **spiegalo, poi proponi un fix conservativo**. Niente refactor impliciti.

## 1. Stack

| Layer | Tecnologia |
|------|-----------|
| Framework | Next.js 14 (App Router, Server Components, **Server Actions**) |
| Auth & DB | Supabase (Postgres + **RLS** + SSR cookies) |
| Linguaggio | TypeScript 5 (`strict`) |
| Validazione | Zod (negli `schemas.ts` di ogni modulo) |
| Styling | Tailwind CSS 3 — design system in `components/ui` |
| Test | Vitest (unit, `modules/**/__tests__`) + Playwright (e2e, `e2e/`) |
| Deploy | Railway (Node server, autodeploy da `main`) |

## 2. Due workspace, un codebase

`account_type` dell'organizzazione (`customer` | `supplier`) decide tutto. Difesa a 3 livelli:

```
middleware.ts          → gate veloce (redirect prima del render). FAIL-OPEN sul solo
                         workspace-gating se la RPC current_account_type fallisce.
modules/identity/
  workspace.ts         → requireCustomerSession() / requireSupplierSession()
                         = guard AUTORITATIVI in cima a ogni layout. FAIL-CLOSED.
RLS (Postgres)         → confine dati definitivo: filtro per organization_id.
```

Mappa route ↔ workspace:

| Workspace | Route group / prefix | Layout guard |
|----------|----------------------|--------------|
| Bakery / customer | `app/(main)/*` | `requireCustomerSession()` |
| Supplier | `app/supplier/*` | `requireSupplierSession()` |
| Auth | `app/(auth)/*`, `app/onboarding`, `app/auth/callback` | pubblico / semi-auth |
| **Portale fornitore esterno** | `app/portal/[token]/*` | **token JWT nel path, NESSUNA sessione Supabase** |

**Invariante UI**: separazione per ruolo. La navigazione è centralizzata in
[`components/layout/navConfig.ts`](components/layout/navConfig.ts) (`CUSTOMER_NAV` / `SUPPLIER_NAV`).
Non hardcodare voci di menu altrove.

⚠️ **`middleware.ts`**: la chiamata `supabase.rpc(...)` non va mai staccata
dall'istanza (usa `this.rest`): una chiamata "unbound" crasha in prod con
`Cannot read properties of undefined (reading 'rest')` → 500. Vedi i commenti nel file.

## 3. Anatomia di un modulo (`modules/<dominio>/`)

Pattern uniforme — **rispettalo, non inventarne altri.** Dettaglio in [`modules/AGENTS.md`](modules/AGENTS.md).

```
schemas.ts     Zod: input boundary. Ogni service .parse() qui.
types.ts       Tipi di dominio (camelCase) esposti alla UI.
repository.ts  SOLO query Supabase tipizzate (RLS-enforced). Zero logica.
service.ts     Business logic: requireOrgId() → validazione → repo / RPC.
actions.ts     'use server'. FormData → service → revalidatePath/redirect. Thin.
```

Moduli presenti: `catalog`, `customers`, `documents`, `goods-receipts`,
`identity`, `inventory`, `marketplace`, `ordering`, `portal`, `production`, `reporting`.

## 4. Vincoli di runtime e deploy (Railway)

- **Node 20.x obbligatorio.** Pinnato in `package.json` → `engines.node: "20.x"`.
  Motivo: il Goods Receipt Engine usa `File` (global Web API disponibile **solo da
  Node 20**) e `pdf-parse`. Su Node 18 → `File is not defined` a runtime.
  ⚠️ **Non esiste `.nvmrc`/`nixpacks.toml`/`Dockerfile`**: l'unico pin è `engines`.
  Se tocchi il runtime, considera di rendere il pin più robusto e segnalalo.
- **`pdf-parse` non va bundlato**: è in `next.config.mjs` →
  `serverComponentsExternalPackages`. Non rimuoverlo. L'import usa il path interno
  `pdf-parse/lib/pdf-parse.js` (il wrapper ha side-effect che rompono webpack).
- **`package-lock.json` SEMPRE sincronizzato** col `package.json`. Railway fa `npm ci`:
  un lockfile fuori sync rompe il deploy (già successo). Dopo ogni `npm install <pkg>`
  committa anche il lockfile.
- **Autodeploy**: ogni push su `main` deploya. Vedi `README.md` per la checklist
  completa delle env var Railway (Supabase keys, `SUPPLIER_TOKEN_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, …).

## 5. Come validare una modifica (obbligatorio, in quest'ordine)

```bash
cd pasticceriaos-web
npm run typecheck     # tsc --noEmit (strict). Deve passare pulito.
npm run test          # vitest run — unit su modules/**/__tests__
npm run build         # next build (ESLint è ignorato in build → gira `npm run lint` a parte)
# e2e (opzionale, richiede .env.local + DB): npx playwright test  (vedi e2e/)
```

Se la modifica tocca SQL/RPC: l'unico modo di applicarla è una nuova migration in
`supabase/migrations_v2/` (vedi [`supabase/AGENTS.md`](supabase/AGENTS.md)). Niente edit retroattivi.

## 6. File critici da non rompere

| File | Perché |
|------|--------|
| `middleware.ts` | Gating workspace + RPC binding fragile + esclusione portale |
| `modules/identity/workspace.ts` | Guard autoritativi customer/supplier |
| `lib/database.types.ts` | Tipi generati dal DB: rigenera, non editare a mano |
| `lib/supabase/{server,middleware,admin}.ts` | Client SSR/admin. `admin` = service role, solo server |
| `next.config.mjs` | externals pdf-parse, header no-store sul portale |
| `package.json` `engines` + `package-lock.json` | Pin Node 20 + integrità deploy |
| `supabase/migrations_v2/*` | Schema + RPC + RLS. Append-only, mai riscrivere |

## 7. Rischi noti (vedi AGENTS.md dei moduli per il dettaglio)

- **Due write-path ATTIVI verso `inventory_movements`** in ricezione
  (`receive_marketplace_order`, `complete_purchase_receipt`) + uno storico
  (`receive_purchase_order`, 019: DEPRECATA, execute revocato). Sono il punto più
  delicato per il doppio conteggio: vedi [`modules/inventory/AGENTS.md`](modules/inventory/AGENTS.md)
  e [`modules/goods-receipts/AGENTS.md`](modules/goods-receipts/AGENTS.md).
- Pin Node fragile (solo `engines`, vedi §4).
- Documenti di analisi nella cartella padre potenzialmente disallineati dal codice.
