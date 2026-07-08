# VOLUME 4 — Moduli di dominio: service, repository, actions

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md)
> Pattern del repo: `schemas.ts` (Zod al confine) → `actions.ts` (boundary sottile 'use server') → `service.ts` (dominio, auth, orchestrazione) → `repository.ts` (solo query) → Supabase/RLS/RPC. Ogni modulo ha il suo `AGENTS.md`.
> Le voci non verificate riga-per-riga in questa edizione sono marcate **[non confermato]**.

## 4.1 identity
**Responsabilità**: auth (signup/signin/signout), sessione arricchita (`requireSession` → userId, org, ruolo), onboarding (org via RPC `create_organization` con `account_type`), profilo fiscale (P.IVA checksum offline, provider-seam per lookup futuri), guard di workspace (`workspace.ts`: `requireCustomerSession`/`requireSupplierSession`, fail-closed).
**Service chiave**: `requireSession`, `requireOrgId` (versione leggera usata dagli altri moduli), `createOrganization`, `verifyVat`, `get/updateFiscalProfile`.
**Dipendenze**: tutti i moduli dipendono da identity; identity non dipende da nessuno.
**Esempio di flusso**: signup → email confirm (`/auth/confirm`, robusta) → onboarding sceglie "pasticceria" → RPC crea org+membership owner → redirect al workspace giusto.

## 4.2 catalog
**Responsabilità**: anagrafiche condivise della bakery: fornitori, `ingredient_products` (unità canonica!), ricette+BOM, listini fornitore.
**Service**: CRUD fornitori/ingredienti/ricette (`create/update/deactivate*`), `listRecipes(activeOnly)`, `getRecipe` con BOM, `assignSupplierBulk`, `getSupplierPriceList`/`setSupplierPrice`/`importPricesFromLastReceivedOrder`.
**Regole**: `UNIQUE (organization_id, name)` sugli ingredienti (niente doppioni — l'anti-doppione UI lo previene a monte); soft-delete ovunque (`is_active`).
**Dipendenze in ingresso**: production (BOM), goods-receipts (matching+creazione al volo), sales/pos (ricette linkabili), ordering (righe ordine), reporting (food cost).

## 4.3 inventory
**Responsabilità**: il dominio magazzino MATERIE PRIME + (dal P0-3) la scrittura waste sui FINITI: livelli/soglie, movimenti manuali, rettifiche, lotti, alert scorte/scadenze.
**Service principali**: `listLevels`, `getLevelForIngredient`, `updateThreshold`, `listMovements(filtri)`, `recordMovement` (movimento manuale tipizzato; `manual_adjustment` esige nota), `adjustStockToCount` (conteggio → delta calcolato server-side), `recordInitialStock`, `getLowStockAlerts`, `recordBatch` (lotto HACCP-lite post-ordine), `getExpiringBatches`, **`recordFinishedGoodsWaste`** (insert `waste` negativo su `finished_goods_movements`, RLS `fgm_insert`; motivi preset nel form).
**Regola cardine**: il service INSERISCE movimenti; i livelli li aggiorna SOLO il trigger. Nessuna funzione tocca `current_quantity`.
**Actions**: `recordMovementAction`, `adjustStockAction`, `recordBatchAction`, `updateThresholdAction`, `recordFinishedGoodsWasteAction`.

## 4.4 goods-receipts
**Responsabilità**: il goods receipt engine (unico bakery+supplier): ciclo di vita `purchase_receipts`, scanner GS1, parser DDT, matching prodotti, contabilizzazione.
**File notevoli**: `service.ts` (696 righe: create/importDdt/registerScan/addManualLine/updateLine/resolveLineProduct/createProductFromLine/completeReceipt/receiveAllAndComplete/receiveOrderInFull/cancelReceipt + wizard support), `ddt-parser.ts` (puro, tollerante, testato), `gs1.ts` (parser AI GS1 completo, testato), `matching.ts` (fuzzy con soglia auto-match, riusato anche da pos e ingredienti), `units.ts` (specchio TS di `unit_conversion_factor`).
**RPC**: `complete_purchase_receipt` (v. VOL-5). Regola: **lo stock cambia SOLO lì**.
**Garanzie**: org-check su ogni entrata; righe già contabilizzate immutabili nel prodotto/unità; conversione-o-errore su ogni cambio unità (import/resolve/create-from-line + RPC 054); apprendimento barcode sul prodotto.
**Esempio**: v. VOL-6 §Ricevere merce.

## 4.5 ordering
**Responsabilità**: ordini fornitore legacy/email (`purchase_orders`): creazione atomica, invio con esito, stati onesti.
**RPC**: `create_purchase_order` (header+righe atomici, 048), `mark_order_sent` (transizione+`dispatch_outcome`+history, 047), `set_order_status` (transizioni residue). `receive_purchase_order` (019/037) è **deprecata e revocata** agli utenti: la ricezione passa SOLO dall'engine.
**Nota di verità**: `partial`/`received` sono scritti esclusivamente da `complete_purchase_receipt` (049).
**Service/repository**: `createOrder`, `updateOrder`, transizioni, liste con esiti invio **[dettagli interni non confermati riga-per-riga]**.

## 4.6 marketplace
**Responsabilità**: connessioni cliente↔fornitore, catalogo fornitore, ordine canonico condiviso, ricezione a magazzino.
**Service**: chiavi (`generateSupplierKey` — plaintext mai persistito, hash sha256; `revokeSupplierKey`), `connectSupplier` (RPC by hash), cataloghi (own/per connessione), **`placeOrder`** (RPC 051: atomico+idempotente end-to-end; audit con attore), `changeOrderStatus` (doppia validazione: `canTransition` + trigger DB), `listOrders`/`getOrder` (RLS **più** filtro org esplicito — difesa in profondità), `receiveMarketplaceOrderIntoInventory` (RPC 023/053), `getLinkedPurchaseOrderId`.
**Storia dura**: i P0 storici (create non atomico, retry che induceva duplicati) sono chiusi in 051 con test SQL dedicati; leak draft chiuso in 052.
**Errori**: `mapPgError` traduce P0200–P0306 e P0212 in messaggi operativi.

## 4.7 portal
**Responsabilità**: portale token-based per fornitori senza account: emissione/verifica JWT (HS256, `SUPPLIER_TOKEN_SECRET`), revoca via `portal_token_version`, letture PO scoppate esplicitamente, azioni: conferma ordine, segnalazione problema, upload documento (`supplierUploadDocument` in documents).
**Sicurezza**: client service-role MA ogni query filtra `supplier_id`+`organization_id`; il middleware NON tocca il portale (early-return). **[Dettagli interni di `service.ts` oltre la verifica token: non confermati riga-per-riga]**.

## 4.8 documents
**Responsabilità**: documenti commerciali e motore di verifica.
**Service**: `createDocument` (upload+righe), **`matchDocumentToOrder`** (3 livelli di match, varianze, anomalie tipizzate, re-match idempotente, backfill fornitore, auto-associazione PO specchio marketplace, **prezzi da fattura verificata**), `resolveAnomaly` (ultima risolta ⇒ matched), `archiveDocument`, `supplierUploadDocument` (dal portale/workspace fornitore).
**Dipendenze**: ordering (righe ordine), goods-receipts (importDdt archivia qui), storage Supabase (upload best-effort: il fallimento non blocca, viene dichiarato).

## 4.9 production
**Responsabilità**: piani, template settimanale, suggerimenti, fabbisogno, completamento.
**Service**: `listPlans/getPlan`, `create/update/cancelPlan`, `completePlan` (→RPC), `quickProduce`, `getWeekTemplate/saveWeekTemplate/applyWeekTemplate`, `getPlanSuggestions` (ultimo piano + stesso-giorno-settimana), `computePlanRequirements` (fabbisogno con conversioni e shortage per piano non salvato).
**Actions** (post P0-1): `createPlanAction`, `previewRequirementsAction`, `ordersForPlanDateAction` (contratto onesto: `{ok:true,…}|{ok:false,error}`), `completePlanAction`, ecc.
**Nota**: `insertPlan` (draft) non è via RPC — il piano nasce sempre `draft`, rischio contenuto e dichiarato (VOL-8).

## 4.10 pos
**Responsabilità**: il bordo cassa. Due metà nette: **webhook** (service-role: `adapter.ts` seam provider, `adapters/mipos.ts` HMAC+parser tollerante, `ingest.ts` ledger `pos_events`→motore vendite, `repository.ts` con org esplicita ovunque) e **UI di sessione** (`service.ts`: mappature, unmapped con suggerimento fuzzy, inbox, replay/relink, dry-run, `getPosIntegrationStatus`, **`getPosHealth`+`derivePosCta`** (`status.ts`, puro e testato), `getPosConfig`/`savePosConfig` self-service con guardia 23505).
**Invarianti**: idempotenza primaria su `pos_events` (event_type nella chiave: sale e void distinti); `nameFallback:false` sul path POS (mapping solo esplicito); reversal senza vendita originale ⇒ `failed` replayabile, mai storno cieco.
**Test**: adapter, ingest, webhook, relink, reconciliation, status (6 file).

## 4.11 sales
**Responsabilità**: il motore vendite (dominio 050): CanonicalSale → risoluzione ricetta → RPC atomica → deduzione FINITI; storni; letture UI.
**Service**: `ingestSale(source,raw)` (adapter `manual`), `ingestCanonicalSale` (cuore: client iniettabile, path system per il webhook), `ingestSaleAsSystem`, `reverseSale(_AsSystem)`, `relinkSaleLines`, `findSaleIdForExternal`, letture (`listSales`, `getSale(Lines)`, `listUnlinkedProducts`, `listLinkableRecipes`).
**Nota storica**: `linkProduct`/`upsertMapping` (la seconda via di mapping) sono stati RIMOSSI (`c4aaa5f`): l'unica via è `upsertPosMapping` (pos). Alcuni commenti legacy citano ancora "esplosione BOM": il codice fa la 050, i commenti no (VOL-8).

## 4.12 customers
**Responsabilità**: ordini cliente/prenotazioni. `listCustomerOrders(includeClosed)`, `getCustomerOrdersForDate` (→ fabbisogno produzione), `createCustomerOrder`, `changeCustomerOrderStatus` (transizioni validate in `types.ts`).
**Gap dichiarati**: insert ordine+righe non atomico; `patchStatus` senza history (VOL-8).

## 4.13 recipe-import
**Responsabilità**: import ricette da testo/CSV/PDF: split blob, parsing deterministico, dedupe, mapping colonne, arricchimento AI **opzionale** (Gemini/Claude; senza key la feature è spenta; l'AI è solo preview, gli schemi al commit restano stretti).
**Qualità**: 6 file di test (parse, dedupe, blob-split, qty-last, ai/adapter, ai/enrich). **[Internals del commit finale: non confermati riga-per-riga]**.

## 4.14 reporting
**Responsabilità**: SOLO letture per dashboard/analytics, sopra viste SQL: `getDashboardSummary`, `getOpenOrders` (v_open_orders), `getInventoryStockFull`, `getRecipeCost(s)/Breakdown` (021), `getMonthlySpend`, `getIngredientPurchaseStats`, `getIngredientRequirements`, `getFinishedGoodsTheoretical*` (046+056, ora con `wasted_qty`), lato supplier: `getSupplierDashboardSummary/OrderFacts/MonthlySales/ProductSales/CustomerStats` (022).
**Regola**: zero scritture, zero logica di dominio: shaping di viste.

---

## MATRICE 3 — Modulo → repository → service → action → RPC (sintesi)

| Modulo | Repository (query) | Service chiave | Actions | RPC usate |
|---|---|---|---|---|
| identity | `repository.ts` (member/org/fiscal) | requireSession, createOrganization | login/signup/fiscal | `create_organization` |
| catalog | CRUD anagrafiche | list/get/create/update/deactivate, priceList | ingredient/recipe/supplier actions | — |
| inventory | levels/movements/batches | recordMovement, adjustStockToCount, recordFinishedGoodsWaste | movement/adjust/batch/waste | — (insert su ledger, trigger fa il resto) |
| goods-receipts | receipts/lines/catalogRefs | importDdt, registerScan, resolve/create, completeReceipt, receiveOrderInFull | 11 actions | `complete_purchase_receipt` |
| ordering | PO/righe/history | createOrder, send, transizioni | order actions | `create_purchase_order`, `mark_order_sent`, `set_order_status` |
| marketplace | (service usa client diretto + RLS) | placeOrder, changeOrderStatus, receive… | place/status/receive/keys/connect | `place_marketplace_order`, `receive_marketplace_order`, `connect_supplier_by_key_hash` |
| portal | letture PO scoppate | verifica token, conferma, problema | portal actions (bound al token) | — |
| documents | insert/patch/anomalie | matchDocumentToOrder, resolveAnomaly | match/resolve/archive/upload | — |
| production | plans/items/template | completePlan, computePlanRequirements, suggestions | plan actions + preview/ordersForDate | `complete_production_plan` |
| pos | pos_configs/events/mappings (service-role) | ingestPosEvent, replay, health, savePosConfig | mapping/config/replay | (via sales) `ingest_sale_system`, `reverse_sale_system` |
| sales | sales/lines/resolve/rpc wrapper | ingestCanonicalSale, reverseSale, relink | recordSale/reverse | `ingest_sale(_system)`, `reverse_sale(_system)`, `relink_sale_lines` |
| customers | orders/items | create, transizioni, forDate | create/changeStatus | — |
| recipe-import | — (usa catalog) | parse/enrich/commit | import actions | — |
| reporting | viste SQL | get* (sola lettura) | — | — |

---
*Prossimo: [VOLUME 5 — Database, SQL, RLS](VOL-5-database-sql.md)*
