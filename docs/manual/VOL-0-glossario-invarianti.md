# VOLUME 0 — Glossario e principi invarianti

> Collana: **Manuale BakeryOS** · [Indice generale](INDEX.md)
> Fonte: codice reale (`modules/`, `supabase/migrations_v2/`), non descrizioni aspirazionali.
> Ultimo allineamento: commit `371b0c7`, migration `056`.

---

## 0.1 Glossario del dominio

I termini sono definiti **come esistono nel codice**, con la tabella/modulo che li incarna.

| Termine | Definizione operativa | Dove vive |
|---|---|---|
| **Organizzazione** | Il tenant: una pasticceria (`account_type='customer'`) o un fornitore (`account_type='supplier'`). Ogni dato operativo è scopato per `organization_id`. | `organizations`, `org_members` (002, 012) |
| **Workspace** | L'interfaccia legata all'`account_type`: bakery (`app/(main)`) o fornitore (`app/supplier`). Stesso codebase, due esperienze. | `middleware.ts`, `modules/identity/workspace.ts` |
| **Materie prime** | Gli ingredienti acquistati (farina, uova…). Dominio inventariale #1. Anagrafica in `ingredient_products`, giacenza derivata dai movimenti. | `modules/catalog`, `modules/inventory` |
| **Prodotti finiti** | Ciò che la pasticceria produce e vende (cannoncini, torte). Dominio inventariale #2, **separato** dal primo. Identificati dalla **ricetta** (`recipe_id`). | `finished_goods_movements/levels` (050) |
| **Ledger** | Registro **append-only** dei movimenti. Due ledger: `inventory_movements` (materie prime, 005) e `finished_goods_movements` (finiti, 050). È la **source of truth**: non si aggiorna, si appende. | migration 005, 050 |
| **Proiezione** | Tabella derivata dal ledger via trigger (`inventory_levels`, `finished_goods_levels`). Mai scritta dall'app. Se diverge dal ledger è un bug, e la riconciliazione notturna lo segnala. | trigger in 005/050, check in 055 |
| **Movimento** | Una riga di ledger: delta firmato + tipo + riferimento + attore. Tipi materie prime: `purchase_receipt`, `production_usage`, `sale_deduction`(legacy), `waste`, `return_to_supplier`, `manual_adjustment`, `initial_stock`. Tipi finiti: `production_output`, `sale_deduction`, `sale_reversal`, `manual_adjustment`, `waste` (056). | 005, 050, 056 |
| **Ricetta** | Anagrafica di un prodotto finito: BOM (ingredienti+quantità+unità), porzioni base, `yield_quantity`, prezzo di vendita opzionale. | `recipes`, `recipe_ingredients` (004) |
| **BOM / distinta base** | Le righe `recipe_ingredients`. Viene "esplosa" **solo dalla produzione** (mai dalla vendita). | 004, RPC `complete_production_plan` |
| **Piano di produzione** | Cosa si produce in una data: righe ricetta × infornate. Stati: `draft` → `in_progress` → `completed` (o `cancelled`). Il **completamento** è l'atto contabile. | `production_plans/_items`, RPC v4 (050) |
| **Infornata (batch)** | Unità di pianificazione: 1 batch = `base_portions` porzioni della ricetta. | `production_plan_items.batch_count` |
| **Ordine fornitore (acquisto)** | `purchase_orders` + `order_line_items`: ordine di materie prime a un fornitore, inviato via email o specchiato dal marketplace. Stati: `draft→sent→confirmed→partial→received` (+`cancelled`), con `dispatch_outcome` per l'invio onesto (047). | `modules/ordering` |
| **Ricevimento (goods receipt)** | L'**unico ingresso a magazzino** materie prime: `purchase_receipts` + righe. Da DDT PDF, scanner o manuale. Contabilizzazione via RPC `complete_purchase_receipt` (delta-idempotente, guardia unità 054). | `modules/goods-receipts`, 035/049/054 |
| **DDT** | Documento di trasporto del fornitore. Parsato best-effort da PDF (`ddt-parser.ts`), sempre archiviato in `commercial_documents`. | `modules/goods-receipts`, `modules/documents` |
| **GS1 / lotto / scadenza** | Barcode strutturati (GTIN, lotto, scadenza, SSCC) letti dallo scanner; generano `ingredient_batches` alla contabilizzazione per tracciabilità HACCP/FEFO. | `gs1.ts` (039), `ingredient_batches` |
| **FEFO** | *First Expired First Out*. Oggi è **suggerimento** (vista lotti + ricette suggerite), NON consumo automatico per lotto: la produzione scala l'aggregato, non i singoli lotti. | `v_expiring_batches`, dashboard |
| **Ordine cliente (prenotazione)** | `customer_orders`: prenotazione con data/ora ritiro (torte). Alimenta il fabbisogno del piano produzione. Stati: `pending→confirmed→in_production→ready→delivered` (+`cancelled`). NON è una vendita. | `modules/customers` |
| **Vendita** | `sales` + `sale_lines`: uno scontrino (manuale o POS). Se la riga è risolta su una ricetta → movimento `sale_deduction` sui **finiti**. Stati vendita: `processed`, `partially_linked`, `unlinked`, `reversed`, `void`. Stati riga: `deducted`, `unlinked`, `no_bom`, `unit_mismatch`. | `modules/sales`, RPC `ingest_sale*` (050) |
| **POS** | La cassa. Integrazione via webhook firmato (MiPOS, HMAC-SHA256): eventi in `pos_events` (idempotenti), poi motore vendite. | `modules/pos`, 044/050 |
| **Mappatura POS** | `product_mappings`: SKU/PLU della cassa → ricetta (+ `portions_per_unit`). Senza mappatura la vendita è registrata ma **non scala nulla** (`unlinked`). Superficie unica: wizard `/sales/pos`. | `modules/pos` |
| **Inbox POS** | `/sales/inbox`: ogni evento della cassa e il suo esito (elaborato/fallito/stornato/non collegato), con replay e relink. | `pos/service.ts` |
| **Replay / Relink** | Replay: rielabora un evento `failed` (idempotente). Relink: dopo aver mappato un prodotto, ricollega le righe `unlinked` di una vendita GIÀ registrata e scala i finiti solo per quelle (RPC `relink_sale_lines`). | `pos/service.ts`, 050 |
| **Storno (reversal)** | Annullo/reso: movimenti **inversi** sui finiti (`sale_reversal`), storia intatta. Mai delete. | RPC `reverse_sale*` |
| **Rimanenza teorica** | Vista `v_finished_goods_daily_theoretical`: per prodotto/giorno, `produced − sold − wasted` (056). Risponde a "quanto dovrebbe esserci sul banco". È **derivata**, non un magazzino. | 046 + 056 |
| **Invenduto / waste (finiti)** | Movimento `waste` (delta negativo) sul ledger finiti: il gesto di fine giornata. Registrabile in 1 tap dal blocco rimanenze della dashboard. | 056, `RecordWasteButton` |
| **Marketplace** | Il ponte cliente↔fornitore dentro BakeryOS: catalogo fornitore, connessioni via chiave, **ordine canonico condiviso** `marketplace_orders` (una sola riga, letta da entrambe le parti via RLS). | `modules/marketplace`, 012–016, 051–053 |
| **Connessione** | `supplier_customer_connections`: il legame pasticceria↔fornitore, creato riscattando una chiave (`PSOS-…`) generata dal fornitore. | 013, RPC `connect_supplier_by_key_hash` |
| **PO specchio** | Alla ricezione di un ordine marketplace `delivered`, la RPC `receive_marketplace_order` crea un `purchase_order` locale (FK `marketplace_order_id` UNIQUE = idempotenza) e carica le materie prime. | 023 + 053 |
| **Portale fornitore (token)** | Superficie separata `/portal/[token]` per fornitori SENZA account: link JWT firmato (`SUPPLIER_TOKEN_SECRET`), niente sessione Supabase. Vede solo i `purchase_orders` legati al token; revoca via `portal_token_version`. | `modules/portal` |
| **Documento commerciale** | `commercial_documents` + righe: DDT/fatture/conferme. Motore di **verifica** (matching a 3 livelli contro l'ordine) con anomalie tipizzate; fattura verificata aggiorna la cache prezzi. | `modules/documents` |
| **Anomalia documento** | Differenza tipizzata documento↔ordine: `quantity_mismatch`, `price_mismatch`, `extra_item`, `total_mismatch`. Si risolvono una a una; a zero aperte il documento torna `matched`. | `documents/service.ts` |
| **Riconciliazione notturna** | `run_nightly_reconciliation()` (055, pg_cron 02:30 UTC): drift ledger↔proiezioni (entrambi i domini), anomalie unità, guardia multi-org. Log SEMPRE in `reconciliation_runs`; notifica in-app SOLO su anomalie. | 055 |
| **Notifiche** | `notifications` per-org (`info/warn/error`): scadenze (cron 034) e riconciliazione (055), con dedup giornaliera. | 032, 034, 055 |
| **Idempotency key** | Chiave client-side (UUID per mount) che rende il "piazza ordine" marketplace ripetibile senza duplicati: stesso key ⇒ stesso ordine, retry = successo. | 014 + 051 |
| **Food cost** | Costo ingredienti per porzione dalla BOM, con conversioni unità esplicite (g↔kg, ml↔l) e **esclusione onesta** dei non convertibili. | viste 021 |
| **CI** | GitHub Actions: `tsc` + vitest + catena `migrations_v2` da zero + 5 test SQL transazionali + smoke riconciliazione. | `.github/workflows/ci.yml` |

## 0.2 Unità di misura

Enum `unit_of_measure`: `g, kg, ml, l, pz, bustina, foglio` (001). Conversioni ammesse **solo** metriche: `g↔kg`, `ml↔l` (fattori 1000/0.001), definite UNA volta in `unit_conversion_factor` (SQL, 021) e specchiate in TS (`modules/goods-receipts/units.ts`). Tutto il resto è **non convertibile**: i write-path che incontrano un'incompatibilità **falliscono con errore esplicito** (errcode `P0212` nel receiving 053/054), mai fallback silenzioso.

## 0.3 Invarianti non negoziabili

Queste regole sono **imposte dal DB** (trigger, CHECK, RPC, RLS), non solo dal codice applicativo. Qualsiasi modifica che le indebolisce è un bug di dominio.

1. **Due domini inventariali separati.** Materie prime (`inventory_*`) e prodotti finiti (`finished_goods_*`) hanno ledger, proiezioni e regole distinti. Nessuna operazione muove entrambi tranne il **completamento produzione** (che è esattamente il ponte: −materie, +finiti, in una transazione).
2. **Il ledger è la verità; le proiezioni sono derivate.** `inventory_levels` e `finished_goods_levels` si aggiornano SOLO via trigger (`update_inventory_level_from_movement`, `apply_finished_goods_movement`). L'app non ha policy di UPDATE su di esse.
3. **Il ledger è append-only.** Le correzioni sono nuovi movimenti (rettifica, storno), mai update/delete di movimenti passati.
4. **La produzione consuma materie prime e crea finiti.** `complete_production_plan` (v4, 050): movimenti `production_usage` (negativi, con conversione unità, 043) + `production_output` (positivi), atomici, idempotenti (piano già `completed` ⇒ errore, non doppio conteggio).
5. **La vendita tocca SOLO i prodotti finiti.** `ingest_sale`/`ingest_sale_system` (050) creano `sale_deduction` su `finished_goods_movements` per le righe risolte su ricetta. **Nessuna esplosione BOM alla vendita, nessun movimento su materie prime.** Descrivere la vendita come "scarico ingredienti" è un errore concettuale (era il modello pre-050, superato).
6. **La ricezione aumenta SOLO le materie prime.** `complete_purchase_receipt` (049+054): movimenti `purchase_receipt` positivi **nell'unità del prodotto** (conversione metrica o errore `P0212`), delta-idempotenti via `qty_posted`, lotti HACCP se c'è scadenza.
7. **Storni e resi vendita ripristinano SOLO i finiti** (`sale_reversal`, positivo).
8. **Prodotto non mappato ≠ errore.** Una riga vendita senza ricetta viene **registrata** (`unlinked`) senza scaricare nulla: verità onesta + rimedio (mappatura→relink). Il POS non può corrompere lo stock in silenzio.
9. **Idempotenza sugli eventi esterni.** `pos_events` UNIQUE su `(org, provider, store, receipt, event_type)`; `sales` UNIQUE su `(org, source, external_sale_id)`; ordine marketplace UNIQUE su `(customer_org, idempotency_key)`; PO specchio UNIQUE su `marketplace_order_id`. Un retry non duplica mai.
10. **RLS su ogni tabella operativa** con scoping per organizzazione via `current_organization_id()` (deterministica, 052). Il service layer aggiunge filtri espliciti dove il leak sarebbe catastrofico (letture marketplace) — difesa in profondità, non alternativa.
11. **Le scritture critiche passano da RPC transazionali** SECURITY DEFINER con org-check interno: `complete_purchase_receipt`, `complete_production_plan`, `ingest_sale(_system)`, `reverse_sale(_system)`, `relink_sale_lines`, `create_purchase_order`, `mark_order_sent`, `place_marketplace_order`, `receive_marketplace_order`, `connect_supplier_by_key_hash`. Header+righe+effetti = una transazione.
12. **La UI non è mai prova di correttezza.** Ogni esito si verifica sul DB; la riconciliazione notturna (055) è il controllo istituzionale che gli invarianti 1–7 reggono anche domani.

## 0.4 Errori concettuali da evitare (quando si parla del prodotto)

| ❌ Errore | ✅ Realtà |
|---|---|
| "La vendita scarica gli ingredienti via BOM" | La vendita scala i **prodotti finiti**; gli ingredienti li ha già consumati la produzione. (Il modello BOM-alla-vendita è esistito — 042 — ed è stato **superato dalla 050**; alcuni commenti legacy nel codice lo citano ancora: fanno testo i movimenti, non i commenti.) |
| "`inventory_levels` è il magazzino" | È la **proiezione** del magazzino. Il magazzino è `inventory_movements`. |
| "La rimanenza teorica è la giacenza dei finiti" | È `produced − sold − wasted` **del giorno** (vista). La giacenza cumulativa è `finished_goods_levels` (oggi non esposta in UI — vedi VOL-8). |
| "Ordine cliente = vendita" | L'ordine cliente è una **prenotazione** che guida la produzione; la vendita è lo scontrino. Il ritiro NON genera automaticamente una vendita (gap noto, VOL-8). |
| "Il portale fornitore è il workspace fornitore" | Sono due superfici diverse: workspace = account+RLS su `marketplace_orders`; portale = link JWT su `purchase_orders` legacy. |
| "FEFO = il sistema consuma i lotti in scadenza" | FEFO oggi è **visibilità+suggerimento**; il consumo per lotto non esiste (i lotti tracciano l'ingresso). |
| "Se l'evento POS fallisce, la vendita è persa" | L'evento resta in `pos_events` con l'errore; il **replay** è idempotente. |
| "Ricevere due volte raddoppia lo stock" | Impossibile per costruzione: delta-posting (`qty_received − qty_posted`) e UNIQUE sul PO specchio. |

---
*Prossimo: [VOLUME 1 — Visione prodotto e superfici](VOL-1-prodotto-superfici.md)*
