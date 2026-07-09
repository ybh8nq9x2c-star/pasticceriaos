# ADR 001 — Instradamento unificato ordini fornitore (canale BakeryOS vs email/manuale)

**Data:** 2026-07-09 · **Stato:** implementato (migration 057 da applicare) · **Area:** ordering / catalog / marketplace

## Contesto

BakeryOS aveva due flussi ordine paralleli e scollegati:

- **Ordini standard** `/orders` → `purchase_orders` + `ingredient_products` locali, inviati via
  email (webhook `ORDER_DISPATCH_WEBHOOK_URL`) o segnati "da inviare a mano".
- **Ordini marketplace** `/marketplace/orders` → `marketplace_orders` +
  `supplier_catalog_items` del fornitore, via RPC `place_marketplace_order` (atomica/idempotente),
  visibili al fornitore nel suo workspace `/supplier/orders`.

Il collegamento fornitore (`connect_supplier_by_key_hash`, migr. 015) creava **solo** la
relazione cross-org `supplier_customer_connections`. L'anagrafica locale
`suppliers.supplier_org_id` (migr. 023) veniva popolata **pigramente** solo da
`receive_marketplace_order`, alla prima consegna. Conseguenza: un fornitore appena collegato
non compariva in `/suppliers` né nella creazione ordine → l'utente non sapeva chi fosse
collegato e per un fornitore collegato poteva comunque nascere un ordine "da inviare a mano".

## Decisione

**Punto di orchestrazione: la selezione del fornitore in `/orders/new`, non il submit delle
righe.** I due write-path hanno line-item incompatibili (ingredienti privati locali vs catalogo
pubblicato dal fornitore): forgiare un `marketplace_order` dalle righe-ingrediente locali è
impossibile (`place_marketplace_order` richiede `catalog_item_id`). Quindi:

1. **Fornitore collegato** → l'entry unico `/orders/new` instrada al composer marketplace
   esistente (`/marketplace/orders/new?connection=<id>`, che già preseleziona la connessione e
   compone dal catalogo). Nessuna duplicazione del write-path.
2. **Fornitore non collegato** → flusso standard invariato (PO + dispatch onesto email/manuale).
3. **Bridge al connect-time (migration 057)**: `connect_supplier_by_key_hash` ora upserta anche
   l'anagrafica locale con `supplier_org_id`, + backfill delle connessioni attive esistenti. Il
   fornitore collegato è così **subito** first-class in `/suppliers` e ordinabile internamente.
4. **Guard write-path**: `ordering.createOrder` rifiuta un PO standard per un fornitore con
   connessione ATTIVA (difesa in profondità contro la "doppia verità").

**Canale = verità derivata, unica** (`lib/supplier-channel.ts`): un fornitore è `bakeryos` solo
se ha `supplier_org_id` valorizzato **E** una connessione attiva; altrimenti `email`. Una
connessione revocata torna onestamente a `email`. Un ordine è interno se
`purchase_orders.marketplace_order_id` è valorizzato (specchio di un ordine marketplace).

## Dati aggiunti/modificati

- **Migration `057_connect_bridges_anagrafica.sql`**: `CREATE OR REPLACE
  connect_supplier_by_key_hash` (aggiunge l'upsert anagrafica, idempotente sull'indice parziale
  `uq_suppliers_org_supplier_org`) + backfill. **Nessun nuovo schema**: riusa
  `suppliers.supplier_org_id` e l'indice esistenti.
- **Tipi ordering**: `PurchaseOrder` / `PurchaseOrderListItem` espongono `marketplaceOrderId`
  (mappato da `purchase_orders.marketplace_order_id`, già selezionato con `*`).

## Effetti su UI e flussi

- **`/orders/new`**: canale mostrato SUBITO alla selezione; collegato → banner "condiviso
  internamente" + CTA "Crea ordine condiviso" (instrada al composer), niente righe locali;
  non collegato → riga sobria "Email / manuale" + flusso invariato.
- **`/suppliers`**: `SuppliersDirectory` con filtri **Tutti / Connessi BakeryOS / Non connessi**,
  badge canale + microcopy, tabella desktop + card mobile.
- **`/suppliers/[id]`**: hero canale (badge full) + CTA "Ordina internamente" se collegato.
- **`/orders` list + `/orders/[id]`**: badge canale per ordine (interno vs email/manuale); nel
  dettaglio, link "Vedi ordine condiviso" per i PO specchio.
- **Primitiva condivisa** `SupplierChannelBadge` + copy centralizzato `CHANNEL_COPY` (una sola
  verità nel prodotto). Server-first: nessun fetch client verso route interne.

## Edge cases

- **Fornitore email-only omonimo + connessione alla stessa org** → si creano due anagrafiche
  (una email, una collegata), coerente col comportamento pre-esistente di `receive_marketplace_order`
  (match solo per `supplier_org_id`). Nessun merge fuzzy per nome/email (rischioso).
- **Connessione revocata** → il canale torna a `email` (l'anagrafica resta; ordini via email
  finché non si ricollega). Il guard write-path si disattiva coerentemente.
- **Auto-riordino** (`createDraftOrdersFromShortage/LowStock`) chiama `repo.insertOrder`
  direttamente, quindi **bypassa il guard**: le bozze da auto-riordino per fornitori collegati
  restano standard (manca una mappatura ingrediente→catalogo). Limite noto, non-P0.
- **Contesto non-cliente** → `listConnectedSuppliers` degrada a `[]` e tutti i fornitori
  risultano `email` (nessuna pagina rotta).

## Delta codice ↔ documentazione

- La doc di `lib/order-dispatch.ts` cita un "canale marketplace" nel dispatch: **falso nel
  codice** — `dispatchOrderToSupplier` fa solo email-webhook o manuale. Il marketplace è un
  dominio separato raggiunto da `place_marketplace_order`, non dal dispatch del PO standard.
  Questa ADR instrada al marketplace a monte (selezione fornitore), non forzando il dispatch.

## Verifica

- `tsc` 0 · `vitest` 347/347 (+8 su `lib/__tests__/supplier-channel.test.ts`) · `next build` ok.
- Casi A/B/C (supplier connesso → ordine interno lato workspace; non connesso → PO standard
  dispatch onesto; liste sempre chiare sul canale): la logica di instradamento e derivazione è
  coperta dai test puri. La verifica click-through end-to-end richiede la migration 057 applicata
  su staging + una connessione seedata (app dietro auth).
