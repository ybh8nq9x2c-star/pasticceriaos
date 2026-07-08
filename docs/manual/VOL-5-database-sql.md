# VOLUME 5 — Database, SQL, RLS, trigger, RPC

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md)
> Fonte: `supabase/migrations_v2/001–056` (la catena canonica; `supabase/migrations/001–003` è lo schema PRE-rewrite, morto, e in CI viene esplicitamente neutralizzato). Verifiche runtime: query read-only su staging e produzione eseguite durante gli audit (drift = 0 su entrambi i ledger).

## 5.1 Perché il ledger è append-only (e cosa significa in pratica)

Un gestionale che fa `UPDATE stock SET qty = qty - 3` perde la storia: non sai più *perché* la farina è a 1,2 kg. BakeryOS registra **eventi** (`+25.000 g purchase_receipt`, `−1.800 g production_usage`, `−3 pz waste`) e deriva la giacenza sommandoli. Conseguenze concrete:
- ogni numero è **spiegabile** (movimenti con `qty_before/qty_after`, riferimento, attore, nota);
- le correzioni sono **nuovi eventi** (rettifica, storno), mai riscritture: l'audit trail non mente;
- la proiezione è **verificabile**: `current_quantity == Σ delta` è un'asserzione meccanica, controllata ogni notte (055) e in tre punti dell'app (test SQL).

## 5.2 Tabelle principali (per dominio)

| Dominio | Tabelle | Migration |
|---|---|---|
| Tenancy | `organizations` (+`account_type` 012, profilo fiscale 038), `org_members` | 002, 012, 038 |
| Catalogo | `suppliers` (+`supplier_org_id` 023, `portal_token_version` 032), `ingredient_products` (UNIQUE org+name, `barcode`), `recipes`, `recipe_ingredients`, `supplier_price_list` | 003, 004, … |
| **Ledger materie prime** | `inventory_movements` (delta≠0, segno vincolato per tipo, `qty_before/after` 035, reference esteso 036/042), **proiezione** `inventory_levels` (+`min_threshold`) | 005, 035, 036, 042 |
| Lotti | `ingredient_batches` (lotto, scadenza, `quantity_remaining`, `receipt_line_id`) | — (+ GS1 su righe receipt, 039) |
| Produzione | `production_plans`, `production_plan_items`, template settimanale | 006, 045 |
| Acquisti | `purchase_orders` (+`dispatch_outcome` 047, `marketplace_order_id` UNIQUE 023), `order_line_items`, `order_status_history` | 007, 047 |
| Ricevimenti | `purchase_receipts`, `purchase_receipt_lines` (`qty_expected/received/posted`, GS1 039, discrepanze) | 035, 039 |
| Documenti | `commercial_documents`, righe, `document_anomalies` | — |
| Marketplace | `supplier_connection_keys` (hash), `supplier_customer_connections`, `supplier_catalog_items`, `marketplace_orders` (+`idempotency_key` UNIQUE parziale), `marketplace_order_lines` (snapshot), `marketplace_order_status_history`, `audit_logs` | 013–015 |
| **Ledger prodotti finiti** | `finished_goods_movements` (tipi+segni vincolati, waste 056), **proiezione** `finished_goods_levels` | 050, 056 |
| Vendite | `sales` (UNIQUE org+source+external_sale_id), `sale_lines` (stato per riga), `product_mappings` (UNIQUE org+source+ref) | 040–042, 050 |
| POS | `pos_configs` (UNIQUE provider+store_id / provider+merchant_code), `pos_events` (UNIQUE org+provider+store+receipt+**event_type**) | 044, 050 |
| Clienti | `customer_orders`, righe | — |
| Sistema | `notifications` (032), `reconciliation_runs` (055) | 032, 055 |

## 5.3 Trigger (gli automatismi che l'app non può aggirare)

| Trigger | Su | Effetto |
|---|---|---|
| `update_inventory_level_from_movement` | INSERT `inventory_movements` | upsert proiezione livelli (SECURITY DEFINER: l'app non ha policy di scrittura sui livelli). Somma i delta **senza conversione**: per questo i write-path convertono PRIMA (043, 053, 054) e la 055 sorveglia le unità |
| `apply_finished_goods_movement` | INSERT `finished_goods_movements` | upsert `finished_goods_levels` (negativi ammessi = verità onesta) |
| `trg_marketplace_order_status_guard` | BEFORE UPDATE `marketplace_orders` | valida transizione (DAG) **e parte** (customer/supplier giusto: P0200–P0203), stampa i timestamp di ciclo vita |
| `trg_marketplace_order_status_log` | AFTER INS/UPD | history append-only scritta DAL DB (nessuna policy INSERT: l'app non può né scriverla né saltarla) |
| `set_updated_at` | varie | timestamp |

## 5.4 RPC — il catalogo delle scritture critiche

Tutte SECURITY DEFINER con org-check interno (`current_organization_id()`), `search_path` pinnato, `revoke public/anon` + `grant authenticated` (le `_system` sono per il service-role del webhook).

| RPC | Migration | Garanzie |
|---|---|---|
| `create_organization` | 011/012 | org+membership owner atomici; un utente = una org (MVP) |
| `create_purchase_order` | 048 | header+righe atomici |
| `mark_order_sent` | 047 | transizione+esito invio+history atomici |
| `complete_purchase_receipt` | 035→049→**054** | delta-idempotente per riga (`qty_posted`); row-lock su receipt/ordine/livelli; **unità del prodotto** (metrica convertita con nota, incompatibile ⇒ `P0212` rollback); lotti; avanzamento ordine con cap; stati derivati |
| `receive_purchase_order` | 019→037 | legacy a residuo; **revocata** all'app (dead by design) |
| `complete_production_plan` | 019→028→043→**050 v4** | il PONTE dei due domini: `production_usage` convertiti (non convertibile ⇒ skip dichiarato) + `production_output`; atomica, non ricompletabile |
| `ingest_sale` / `ingest_sale_system` | 042→**050** | vendita+righe+`sale_deduction` FINITI in una transazione; ON CONFLICT ⇒ ritorna la vendita esistente (zero doppia deduzione) |
| `reverse_sale(_system)` | 050 | storno append-only (`sale_reversal`) |
| `relink_sale_lines` | 050 | ricollega righe unlinked post-mapping, deduce SOLO le nuove, ricalcola stato vendita |
| `connect_supplier_by_key_hash` | 015 | risolve+valida chiave, upsert connessione, audit — il plaintext non tocca mai il DB |
| `place_marketplace_order` | **051** | SECURITY **INVOKER** (RLS resta il confine): header+righe+submit atomici; idempotenza end-to-end (stessa key ⇒ stesso ordine, retry = successo); ripara i draft fantasma legacy |
| `receive_marketplace_order` | 023→**053** | PO specchio UNIQUE (+ race-safe), carico materie prime con **unità compatibili** (P0212), prezzi cache convertiti |
| `run_nightly_reconciliation` | **055** | read-only sul dominio: drift raw/finiti, unità movimenti/livelli≠prodotto, multi-org; log SEMPRE, notifiche solo su anomalie |
| helper | 009/012/021/052 | `current_organization_id()` (**deterministica**: membership più vecchia, 052), `current_account_type()`, `unit_conversion_factor` (definizione UNICA delle conversioni), `is_org_owner()` |

## 5.5 RLS — il confine dati

Ogni tabella operativa ha policy per-org su `current_organization_id()`. Punti notevoli:
- **marketplace** (016+052): entrambe le parti leggono lo stesso ordine; il fornitore NON legge i `draft` (052 — un draft è un'intenzione d'acquisto); insert ordine solo customer+draft+connessione attiva; history senza policy INSERT (solo trigger); lato "chi fa quale transizione" è nel trigger, non nella policy.
- **proiezioni** (`inventory_levels`, `finished_goods_levels`): SELECT sì, scrittura NO per l'app (solo trigger definer).
- **audit_logs**: append-only per-org (no update/delete).
- **`reconciliation_runs`**: RLS attiva senza policy = telemetria di piattaforma, non dato di dominio.
- Il **service layer marketplace aggiunge filtri org espliciti** alle letture (difesa in profondità): una regressione di policy non diventa un leak.
- Test di regressione RLS **in CI**: `marketplace_rls.test.sql` (isolamento A/B/S, denial cross-workspace, draft invisibili, trigger transizioni).

## 5.6 Cron & edge functions

| Job | Quando | Cosa |
|---|---|---|
| `expiry-alerts-daily` (pg_cron 034 → edge function via pg_net, secret nel Vault) | 05:00 UTC | lotti in scadenza ≤3gg ⇒ notifica per org (dedup giornaliera) + email Resend se configurata (altrimenti risposta dichiara il canale spento) |
| `nightly-reconciliation` (pg_cron 055, tutto in-DB) | 02:30 UTC | v. sopra. Prima run verificata a 0 anomalie su staging E produzione |

## 5.7 Storia delle correzioni di dominio critiche (perché il DB è fatto così)

| Quando | Cosa è stato corretto | Migration |
|---|---|---|
| Bug B | il receipt engine non poteva contabilizzare (CHECK `reference_type` troppo stretto) | 036 |
| Bug A | doppio conteggio engine(parziale)+legacy(totale) | 037 (residuo) — entrambi con test ladder `receipts_double_count.test.sql` |
| Unità in produzione | `production_usage` convertito all'unità di magazzino | 043 |
| **Correzione di dominio** | la vendita smette di "esplodere il BOM": nasce il ledger FINITI; idempotenza `pos_events` con `event_type` | **050** |
| Marketplace P0 | place atomico+idempotente; org deterministica; no-draft al fornitore | 051, 052 |
| Unità nel receiving | bridge marketplace e receipt engine convertono-o-falliscono | 053, 054 |
| Sorveglianza | riconciliazione notturna | 055 |
| Invenduto | `waste` sui finiti + vista teorica `produced−sold−wasted` | 056 |

## 5.8 MATRICE 6 — Flusso business → source of truth → proiezioni/viste usate

| Flusso | Source of truth | Proiezioni/viste lette |
|---|---|---|
| Ricezione merce | `inventory_movements` (+`purchase_receipt_lines.qty_posted` per l'idempotenza) | `inventory_levels`, `ingredient_batches` |
| Produzione | `inventory_movements` + `finished_goods_movements` | livelli entrambi; `v_finished_goods_daily_theoretical` (produced) |
| Vendita / storno | `sales`+`sale_lines` + `finished_goods_movements` | `finished_goods_levels` (non ancora esposta in UI), vista teorica (sold) |
| Invenduto | `finished_goods_movements` (waste) | vista teorica (wasted) |
| Ordini acquisto | `purchase_orders`+righe+history | `v_open_orders` |
| Marketplace | `marketplace_orders`+lines+history (riga UNICA condivisa) | viste 022 lato fornitore |
| Food cost / analytics | ledger + anagrafiche | viste 021/022, `v_expiring_batches` |
| Salute sistema | i due ledger | `reconciliation_runs` |

## 5.9 MATRICE 2 — Funzione utente → scritture DB → effetti inventariali

| Funzione | Scritture | Materie prime | Prodotti finiti |
|---|---|---|---|
| Completa ricevimento | movements(+), batches, receipt_lines.qty_posted, PO.status, history | **+** (unità prodotto) | — |
| Completa produzione | movements(−) + fg_movements(+), plan.status | **−** | **+** |
| Vendita (riga mappata) | sales, sale_lines, fg_movements(−) | — | **−** |
| Storno vendita | fg_movements(+), sales.status | — | **+** |
| Relink post-mapping | sale_lines.recipe_id, fg_movements(−) solo nuove | — | **−** |
| Invenduto | fg_movements(waste −) | — | **−** |
| Rettifica ingrediente | movements(±, nota obbligatoria) | **±** | — |
| Ricezione marketplace | PO specchio, order_line_items, movements(+), history | **+** | — |
| Ordine cliente | customer_orders(+items) | — | — (guida solo il fabbisogno) |
| Piazza ordine marketplace | marketplace_orders+lines+history(trigger), audit | — | — |

---
*Prossimo: [VOLUME 6 — Flussi end-to-end](VOL-6-flussi-end-to-end.md)*
