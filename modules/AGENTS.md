# modules/ — Agent Guide

Business logic per dominio. **Una struttura unica per tutti i moduli**: imitala,
non introdurre layer nuovi.

## Layering (rispetta la direzione delle dipendenze)

```
app/ (page/route/action UI)
   │  chiama
   ▼
actions.ts   'use server'. Boundary HTTP→dominio. FormData → service → revalidate/redirect.
   ▼
service.ts   Business logic. SEMPRE: requireOrgId()/requireSession() → schema.parse() → repo/RPC.
   ▼
repository.ts  SOLO query Supabase tipizzate. Zero regole di dominio, zero auth.
   ▼
Supabase (Postgres + RLS)   confine dati: filtro per organization_id.

schemas.ts   Zod. Tipi di input derivati (`z.infer`). Validazione SOLO qui.
types.ts     Tipi di dominio (camelCase) per la UI. Mappati dal repo (snake_case → camel).
```

## Regole

- **Multi-tenant**: ogni operazione passa da `requireOrgId()` (o `requireSession()`) di
  `modules/identity`. Non leggere `organization_id` in altri modi.
- **Validazione al boundary**: l'input grezzo entra nel service e viene `.parse()`-ato
  subito con lo schema Zod. Non fidarti del FormData.
- **Errori tipizzati**: lancia `AuthError` / `BusinessRuleError` / `NotFoundError` da
  `lib/errors`. Le action le convertono con `getErrorMessage`. Mai `throw new Error('...')` grezzo.
- **Repository puro**: ogni query mappa l'errore con `mapSupabaseError`. Nessuna logica
  condizionale di dominio nel repo.
- **Scritture transazionali multi-tabella → RPC Postgres** (`supabase.rpc(...)`), non
  sequenze di insert lato app. Vedi `ordering`, `marketplace`, `goods-receipts`.
- **Action thin**: niente logica di dominio nelle action, solo orchestrazione + `revalidatePath`.

## Anti-pattern (rifiutare in review)

- ❌ Query Supabase dentro `service.ts` o nelle pagine, bypassando il repository.
  (Eccezione tollerata oggi: alcuni service fanno query di sola lettura inline per
  join leggeri — se ne aggiungi, tienile sotto e dichiaralo.)
- ❌ Logica di dominio in `actions.ts`.
- ❌ Tipi `snake_case` del DB che colano fino alla UI: mappa in `types.ts`.
- ❌ Nuovi moduli che ricoprono un dominio già esistente.

## Mappa dei moduli

| Modulo | Responsabilità | Note |
|--------|----------------|------|
| `identity` | Auth, sessione, onboarding, **workspace guard** | `requireOrgId`, `requireSession`, `workspace.ts` |
| `catalog` | Ingredienti, ricette, anagrafica prodotti | `createIngredient` riusato dal goods-receipt |
| `inventory` | **Magazzino / ledger stock** | Vedi `inventory/AGENTS.md`. Fonte di verità |
| `goods-receipts` | **Goods Receipt Engine** (bakery+supplier) | Vedi `goods-receipts/AGENTS.md` |
| `ordering` | Ordini d'acquisto (PO) + ricezione | RPC `receive_purchase_order` |
| `marketplace` | Connessioni cross-org, catalogo, ordini marketplace | RPC `receive_marketplace_order`, `keys.ts` |
| `portal` | Portale fornitore esterno token-based | Nessuna sessione Supabase |
| `documents` | Documenti commerciali (DDT/fatture) + matching | `matching.ts` semantica condivisa |
| `production` | Piani di produzione | RPC `complete_production_plan` (scarica stock) |
| `customers` | Ordini cliente lato bakery | |
| `reporting` | Food cost, analytics | Solo read; usa viste DB |

## Validazione

`npm run typecheck && npm run test`. Test unit in `modules/<x>/__tests__/*.test.ts`
(matching, transizioni di stato, regression null). Aggiungi un test per ogni regola
di dominio nuova.
