# supabase/ — Agent Guide

DB Postgres gestito da Supabase: schema, **RLS**, **RPC transazionali**, viste, cron.

## Struttura

```
migrations_v2/      ← ✅ migration ATTIVE. Ordine = prefisso numerico (001 → 035).
migrations/         ← ⚠️ legacy (001–003). Storico, NON la fonte attuale. Non estendere.
functions/          ← Edge function Deno (expiry-alerts, cron). Esclusa dal tsconfig app.
tests/              ← Test SQL (pgTAP-style) su RLS e RPC.
config.toml         ← Config progetto Supabase locale.
migrations_v2/NOTES.md, PRODUCTION_ROLLOUT.md  ← leggi prima di applicare in prod.
```

## Regole sulle migration (append-only)

- **Mai riscrivere una migration già applicata.** Ogni cambiamento = nuovo file con
  prefisso numerico successivo. Lo storico è immutabile.
- Stile dominante: **additivo & sicuro** — nuove tabelle/enum/colonne *nullable* + RPC.
  Evita modifiche distruttive al comportamento dei write-path esistenti.
- Applicazione: Supabase CLI (`supabase db push`) o SQL Editor, **in ordine numerico**.
- Dopo modifiche allo schema, **rigenera `lib/database.types.ts`** (non editarlo a mano).

## RPC = unità transazionali (write-path critici)

Le scritture multi-tabella vivono come funzioni Postgres `security definer set search_path`,
con check `current_organization_id()` esplicito. Inventario delle RPC che muovono stock/ordini:

| RPC | File | Effetto |
|-----|------|---------|
| `receive_purchase_order` | 019 | Ricezione PO totale → movimenti + stato `received` |
| `complete_production_plan` | 019 | Scarico stock da produzione |
| `receive_marketplace_order` | 023 | Ordine marketplace consegnato → PO specchio + movimenti (idempotente) |
| `complete_purchase_receipt` | 035 | **Goods Receipt Engine**: movimenti incrementali idempotenti + lotti |
| `create_organization` | 011 | Onboarding org + membership |
| `current_account_type` | 012 | account_type org (usato da middleware + workspace guard) |

⚠️ I primi quattro scrivono tutti su `inventory_movements`: vedi il rischio doppio
conteggio in [`../modules/inventory/AGENTS.md`](../modules/inventory/AGENTS.md).

## RLS — confine dati

- Ogni tabella di dominio ha RLS attiva, filtrata per `current_organization_id()`.
- È il **terzo livello** di difesa workspace (dopo middleware e layout guard): non
  affidarti solo all'app, ma non indebolire mai le policy.
- Il trigger `update_inventory_level_from_movement` è `SECURITY DEFINER` apposta:
  `inventory_levels.current_quantity` non ha policy di INSERT per utenti normali.

## Anti-pattern

- ❌ Editare un file in `migrations_v2/` già applicato.
- ❌ Aggiungere logica in `migrations/` (legacy).
- ❌ RPC senza check `current_organization_id()` / senza `revoke ... from public, anon`.
- ❌ Modificare `database.types.ts` a mano invece di rigenerarlo.

## Validazione

Test SQL in `tests/` (es. `marketplace_rls.test.sql`, `ordering_production_rpc.test.sql`).
Dopo una migration: rigenera i types, poi `npm run typecheck` nell'app.
