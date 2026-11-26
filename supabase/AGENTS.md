# supabase/ — Agent Guide

DB Postgres gestito da Supabase: schema, **RLS**, **RPC transazionali**, viste, cron.

## Struttura

```
migrations_v2/      ← ✅ migration ATTIVE. Ordine = prefisso numerico (001 → 057, in crescita).
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
- Applicazione: **in ordine di `migrations_v2/CHAIN`** (unico punto di verità; i `*_down.sql` sono `!exclude`).
  Locale/CI: `npm run db:local` (Docker). Contro un DB: `npm run db:chain`. **Non** usare `supabase db push`
  (legge la cartella legacy `migrations/`). Nuova migration = file + riga in `CHAIN`.
- Dopo modifiche allo schema, **rigenera `lib/database.types.ts`** (non editarlo a mano).

## RPC = unità transazionali (write-path critici)

Le scritture multi-tabella vivono come funzioni Postgres `security definer set search_path`,
con check `current_organization_id()` esplicito. Inventario delle RPC che muovono stock/ordini:

| RPC | File | Effetto |
|-----|------|---------|
| `receive_purchase_order` | 019 | ⚠️ DEPRECATA (execute revocato): ricezione solo via engine 035 |
| `complete_production_plan` | 019→**060 (v5)** | −materie prime (1 movimento/ingrediente) + **consumo FEFO dei lotti** collegato al movimento + finiti; righe non scaricabili **dichiarate** in `production_plans.completion_report`; ritorna l'esito jsonb |
| `receive_marketplace_order` | 023 | Ordine marketplace consegnato → PO specchio + movimenti (idempotente) |
| `complete_purchase_receipt` | 035 | **Goods Receipt Engine**: movimenti incrementali idempotenti + lotti |
| `quick_produce` | 063 | Produzione rapida sul piano del giorno (find-or-create), infornate postate subito (`posted_batch_count`); il completamento non le riscarica |
| `save_production_plan` | 063 | Piano: testata + righe atomiche; infornate postate protette (P0047) |
| `create_customer_order` | 063 | Prenotazione: testata + righe atomiche |
| `begin_order_dispatch` / `record_order_dispatch` | 063 | Invio ordine: sent + `dispatch_id` stabile PRIMA dell'email; doppio submit non rispedisce |
| `rotate_supplier_portal_token` | 063 | Unica via per ruotare il link del portale (solo owner) |
| `record_inventory_movement` / `record_finished_goods_waste` | 059 | Unici write-path client verso i ledger |
| `open_receipt_for_order` | 061 | Find-or-create atomico della sessione di ricevimento |
| `rotate_pos_webhook_secret` | 062 | Ruota il segreto HMAC per-config della cassa |
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
