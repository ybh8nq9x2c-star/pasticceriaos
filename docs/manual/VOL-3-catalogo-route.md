# VOLUME 3 — Catalogo funzione per funzione delle app routes

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md)
> Convenzioni: **S** = Server Component, **C** = Client Component, **S+C** = pagina server che monta form/pannelli client con props.
> Guard: `mw` = middleware; `cust`/`supp` = `requireCustomerSession`/`requireSupplierSession`; `sess` = `requireSession`/`requireOrgId`; `tok` = verifica JWT portale; `hmac` = firma webhook. La RLS vale SEMPRE sotto.
> Stato post-`371b0c7`: tutte le pagine di editing sono server-first (P0-1); non esistono più fetch client verso route interne.

## 3.1 MATRICE 1 — Route → modulo → action → dati (bakery workspace `(main)`)

| Route | Tipo | Dati caricati (server) | Action usate | Moduli |
|---|---|---|---|---|
| `/dashboard` | S+C | 11 sorgenti `allSettled`: summary, open orders, alert stock, food cost, scadenze, documenti, ordini cliente, top spesa, receipts aperti, piani, teorico finiti | `recordFinishedGoodsWasteAction` (RecordWasteButton) | reporting, inventory, goods-receipts, documents, customers, production, identity |
| `/production` | S | `listPlans` (+stato derivato pending) | — | production |
| `/production/new` | S+C | `listRecipes(true)`, `getPlanSuggestions`, `getCustomerOrdersForDate(oggi)` — `allSettled` con `loadErrors` visibili | `createPlanAction`; on-demand: `previewRequirementsAction`, `ordersForPlanDateAction` | production, catalog, customers |
| `/production/[id]` | S+C | `getPlan`, requirements | `completePlanAction`, `cancelPlanAction`, `updatePlanAction`, bozze ordine (`DraftOrdersButton`) | production, reporting, ordering |
| `/production/quick` | S+C | ricette | `quickProduceAction` | production |
| `/production/template` | S+C | template settimanale | `saveWeekTemplateAction`, `applyWeekTemplateAction` | production |
| `/sales` (hub) | S+C | `listSales`, `getPosHealth('mipos')`, `listCustomerOrders` | `reverseSaleAction` (ReverseSaleButton) | sales, pos, customers |
| `/sales/new` | S+C | `listLinkableRecipes` | `recordSaleAction` | sales, catalog |
| `/sales/[id]` | S | `getSale`, `getSaleLines` | — (link a wizard con highlight) | sales |
| `/sales/pos` | S+C | `getPosHealth`, `getPosConfig`, `listPosMappings`, `listUnmappedPosProducts`, `listRecipeOptions` | `savePosConfigAction`, `upsertPosMappingAction`; fetch a `/api/pos/dry-run` (DryRunTester) | pos, catalog, sales |
| `/sales/inbox` | S+C (`force-dynamic`) | `listPosEvents(tab)`, `getPosReconciliation(7)` | replay via `/api/pos/replay-event` (ReplayButton) | pos, sales |
| `/customers` | S | `listCustomerOrders(storico?)` | `changeCustomerOrderStatusAction` (inline, bound) | customers |
| `/customers/new` | S+C | ricette per le righe | `createCustomerOrderAction` | customers, catalog |
| `/recipes` | S | `listRecipes` | — | catalog |
| `/recipes/new` | S+C | `listIngredients` | `createRecipeAction` | catalog |
| `/recipes/[id]` | S | `getRecipe` + food cost breakdown | `deactivateRecipeAction` | catalog, reporting |
| `/recipes/[id]/edit` | S+C | ricetta+ingredienti via props | `updateRecipeAction` | catalog |
| `/recipes/import` | S+C | — (upload) | actions del modulo recipe-import (parse/commit) | recipe-import, catalog |
| `/suppliers` | S | `listSuppliers` (+ livelli listino — ⚠️ query diretta, §3.5) | — | catalog |
| `/suppliers/new` | S+C | — | `createSupplierAction` | catalog |
| `/suppliers/[id]` | S+C | `getSupplier` (404 reale) | `updateSupplierAction`, `deactivateSupplierAction`; PortalLinkPanel → actions portal | catalog, portal |
| `/suppliers/[id]/price-list` | S+C | listino fornitore | `setSupplierPrice`, import da ultimo ordine | catalog |
| `/orders` | S | `getOpenOrders`/lista PO con esiti invio | — | ordering, reporting |
| `/orders/new` | S+C | ingredienti+fornitori (prefill `?ingredient&qty`) | `createOrderAction` → RPC 048 | ordering, catalog |
| `/orders/[id]` | S+C | ordine+righe+history+batches | `sendOrderAction` (→`mark_order_sent`), `receiveOrderInFullAction`, `recordBatchAction`, cambio stato | ordering, goods-receipts, inventory |
| `/receipts` · `/receipts/new` · `/receipts/[id]` | S+C | `ReceiptsIndexView/ReceiptNewView/ReceiptDetailView` (mode bakery): receipts, fornitori, ordini ricevibili, catalogo picker | `importDdtAction`, `createReceiptAction`, `registerScanAction`, `addManualLineAction`, `updateLineAction`, `resolveLineProductAction`, `createProductFromLineAction`, `completeReceiptAction`, `receiveAllAndCompleteAction`, `cancelReceiptAction` | goods-receipts, documents, catalog |
| `/documents` | S | `listDocuments` + conteggi stato | — | documents |
| `/documents/new` | S+C | fornitori/ordini | `createDocumentAction` (upload) | documents |
| `/documents/[id]` | S+C | `getDocument` + righe + anomalie | `matchDocumentAction`, `resolveAnomalyAction`, `archiveDocumentAction` (MatchPanel) | documents, ordering |
| `/inventory` | S | `getInventoryStockFull` | — (CTA→ordini/rettifica) | reporting, inventory |
| `/inventory/movements` | S | `listMovements` (filtri) | — | inventory |
| `/inventory/movement` | S+C | `listIngredients` | `recordMovementAction` | inventory, catalog |
| `/inventory/batches` | S | `getExpiringBatches`/lotti | — | inventory |
| `/marketplace/suppliers` | S+C | connessioni + catalogo per connessione | `connectSupplierAction`, `revokeConnectionAction` | marketplace |
| `/marketplace/orders` | S | `listOrders` (filtro org esplicito + RLS) | — | marketplace |
| `/marketplace/orders/new` | S+C | catalogo della connessione | `placeOrderAction` → RPC 051 | marketplace |
| `/marketplace/orders/[id]` | S+C | `getOrder` (righe+history) | `changeOrderStatusAction`, `receiveMarketplaceOrderAction`, upload documento | marketplace, documents |
| `/analytics` | S | stock full, open orders, spesa 6m, top spesa, food cost | — | reporting |
| `/settings` | S+C | profilo org + fiscale | `updateFiscalProfileAction`, `verifyVatAction` | identity |
| `/settings/pos` | S | — | — | **redirect** → `/sales/pos` (preserva `?highlight`) |

## 3.2 Supplier workspace (`/supplier/*`) — guard `mw + supp` + RLS

| Route | Tipo | Dati | Action | Note |
|---|---|---|---|---|
| `/supplier` | S | KPI 022, order facts, top clienti/prodotti | — | "Da fare adesso" mobile se `submitted>0`; tabella prodotti con guardia overflow |
| `/supplier/orders` | S | `getSupplierOrderFacts` (draft esclusi anche da RLS 052) | — | filtri stato con conteggi |
| `/supplier/orders/[id]` | S+C | `getOrder` condiviso | `changeOrderStatusAction` (lato supplier) | stesso `OrderDetail` della bakery |
| `/supplier/receipts*` | S+C (`force-dynamic`) | stesse `ReceiptViews` con `mode='supplier'` | stesse action goods-receipts | engine unico |
| `/supplier/catalog` | S+C | catalogo proprio | `upsertCatalogItemAction`, `deactivateCatalogItemAction` | prezzi snapshottati alla vendita |
| `/supplier/keys` | S+C | chiavi (prefix, stato) | `generateKeyAction` (plaintext mostrato UNA volta), `revokeKeyAction` | hash sha256 a riposo |
| `/supplier/customers` | S | clienti connessi | `revokeConnectionAction` | |
| `/supplier/analytics` | S | vendite mensili, per prodotto, per cliente (022) | — | |
| `/supplier/settings` | S+C | profilo | come bakery | |

## 3.3 Portale token (`/portal/[token]/*`) — guard `tok` (niente sessione)

| Route | Tipo | Comportamento |
|---|---|---|
| `/portal/[token]` | S | redirect a `…/orders` |
| `/portal/[token]/orders` | S | lista PO del supplier del token (service-role + filtri espliciti) |
| `/portal/[token]/orders/[orderId]` | S+C | dettaglio + `PortalOrderActions`: conferma, segnala problema, upload DDT/fattura (actions bound al token) |
| `/portal/expired` | S | token scaduto/revocato: messaggio onesto, nessun dato |

## 3.4 API routes e superfici di sistema

| Route | Auth | Scopo | Note |
|---|---|---|---|
| `POST /api/webhooks/[provider]` | `hmac` | ingest eventi POS | firma su body grezzo PRIMA di ogni scrittura; 401 solo su firma invalida, 200 su tutto il resto (no retry-loop) con log strutturato; org da `pos_configs` |
| `POST /api/pos/dry-run` | `sess` (writer, nel service) | interpreta un payload SENZA scritture | usato dal wizard |
| `POST /api/pos/replay-event/[id]` | `sess` (writer) | replay/relink idempotente | usato dall'inbox |
| `POST /api/pos/test-connection` | `sess` | checklist attivazione (`getPosIntegrationStatus`) | |
| `GET /api/pos/reconciliation` | `sess` | riconciliazione giornaliera | la stessa dell'inbox |
| `(auth)` login/signup, `/auth/confirm`, `/auth/error`, `/onboarding`, `/unauthorized` | pubblica/semi | autenticazione e creazione org (`create_organization` RPC, account_type scelto qui) | conferma email robusta (mai 500) |

Le 9 route `/api/catalog/*`, `/api/customers/orders`, `/api/production/*`, `/api/inventory/level/*` **non esistono più** (P0-1, `371b0c7`): i loro consumatori sono server-first.

## 3.5 Comportamento in errore & deviazioni residue dal pattern

- **Errore di caricamento server**: error boundary di superficie (`app/(main)/error.tsx`, `app/supplier/error.tsx`) — mai pagina bianca. `/production/new` degrada per-sorgente con banner `loadErrors` + Ricarica.
- **Errore di action**: `ActionState {status:'error', error}` con messaggi Zod/dominio in italiano; gli errcode Postgres di dominio (P02xx) sono mappati a messaggi umani (`mapPgError`).
- **Deviazioni note (accettate e tracciate, VOL-8)**: `suppliers/page.tsx` fa una query diretta Supabase per i conteggi listino bypassando il service (non è un rischio RLS, è una layering violation); `DryRunTester` e `ReplayButton` usano fetch verso `/api/pos/*` invece di server action (scelta storica, guardie nel service); alcune pagine restano interamente client per natura (form dinamici) ma SOLO con dati da props.

---
*Prossimo: [VOLUME 4 — Moduli di dominio](VOL-4-moduli-dominio.md)*
