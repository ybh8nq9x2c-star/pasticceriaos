# modules/inventory/ — Agent Guide

> **Il magazzino è il dominio centrale di BakeryOs. Questa è la fonte di verità.**
> Se sbagli qui, sbagli il prodotto.

## Modello dati (DB)

```
inventory_movements   LEDGER append-only. Source of truth. Ogni entrata/uscita = 1 riga immutabile.
                      quantity_delta: >0 entrata, <0 uscita, =0 VIETATO.
                      Correzioni = NUOVO movimento 'manual_adjustment' (note obbligatorie),
                      mai UPDATE/DELETE di righe esistenti.
                         │ trigger trg_inventory_movement_after_insert (SECURITY DEFINER)
                         ▼
inventory_levels      PROIEZIONE di current_quantity per (org, prodotto).
                      Aggiornata SOLO dal trigger. L'app NON scrive mai current_quantity.
                      Unico campo scrivibile dall'app: min_threshold (configurazione, non stock).
ingredient_batches    Tracciabilità lotto/scadenza (FEFO/HACCP) SOPRA il ledger.
                      NON muove stock di per sé: il carico è già nel movimento.
```

Definizione in `supabase/migrations_v2/005_inventory.sql`. **Leggila prima di toccare il magazzino.**

## INVARIANTE NON NEGOZIABILE

> Lo stock cambia **esclusivamente** inserendo una riga in `inventory_movements`.
> `inventory_levels.current_quantity` è derivato. Mai un `UPDATE` diretto.

Vincoli DB da rispettare quando inserisci un movimento (`service.ts` → `normalizeSign`):
- segno coerente col tipo: `purchase_receipt`/`initial_stock` > 0; `production_usage`/`waste`/`return_to_supplier` < 0; `manual_adjustment` libero.
- `reference_type` ∈ {`purchase_order`,`production_plan`,`manual`} e va **in coppia** con `reference_id` (o entrambi null).
- `manual_adjustment` richiede `notes` non vuote.

## I TRE write-path verso il ledger (⚠️ rischio doppio conteggio)

Tutti finiscono in `inventory_movements` e si appoggiano allo stesso trigger:

| RPC | Migration | Origine | Semantica |
|-----|-----------|---------|-----------|
| `receive_purchase_order` | 019 | **DEPRECATA (Sprint 2)**: `execute` revocato a `authenticated`, non più invocabile dall'app | (storico) Ricezione TOTALE |
| `receive_marketplace_order` | 023 | `marketplace` (ordine cross-org consegnato) | Idempotente via `purchase_orders.marketplace_order_id UNIQUE` |
| `complete_purchase_receipt` | 035 (+049) | `goods-receipts` (engine) — **unico path di ricezione** | **Incrementale/idempotente** per riga via `qty_posted` (delta = received − posted). Porta il PO a `received` se completo, a `partial` se incompleto (049) |

**Stato attuale:** la ricezione che muove stock passa **solo** da `complete_purchase_receipt`.
`receive_purchase_order` (019) è deprecata e non invocabile (Sprint 2); `ordering` non ha
più nessun path → `received`. Il PO riflette la verità: `partial` quando è arrivata solo
una parte, `received` quando è completo — entrambi scritti esclusivamente dall'engine.
➜ **Non riaprire scorciatoie di ricezione lato `ordering`: un secondo write-path
ricreerebbe il rischio di doppio carico sullo stesso PO.**

## Pattern corretto per "ricevere merce"

Non scrivere movimenti a mano dalla UI per le ricezioni: usa il **Goods Receipt Engine**
(`modules/goods-receipts`), che già fa movimenti + lotti + avanzamento ordine in una RPC
transazionale e idempotente. `recordMovement`/`recordInitialStock` di questo modulo sono
per movimenti puntuali (carico iniziale, rettifiche, scarichi manuali), non per ricezioni complesse.

## Anti-pattern

- ❌ `update inventory_levels set current_quantity = ...` (qualsiasi forma).
- ❌ Movimento con `quantity_delta = 0` o segno incoerente col tipo.
- ❌ Nuovo write-path verso lo stock che non passi per un movimento (e idealmente per una RPC transazionale).
- ❌ Correggere stock cancellando movimenti storici invece di un `manual_adjustment`.

## Validazione

`npm run typecheck && npm run test`. Test: `__tests__/batch-null-regression.test.ts`.
Per modifiche ai write-path, esercita anche `e2e/tests/40-faseD-ricezione.spec.ts` e
`e2e/tests/80-goods-receipts.spec.ts`.
