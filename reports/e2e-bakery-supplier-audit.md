# PasticceriaOS E2E Audit — bakery ↔ supplier

**Data:** 11 giugno 2026 · **Esecutore:** QA lead (Claude) con due agenti operativi simulati
**Esito sintetico:** core loop pasticceria **solido e matematicamente corretto fino al DB**; bloccanti concentrati su onboarding fornitore (catalogo), lotti HACCP, verifica documentale e portale token. **Stato: pronto con riserva** (dettagli in fondo).

---

## Scope

Audit end-to-end reale dell'applicazione **deployata in produzione**, simulando una giornata operativa completa di una pasticceria artigianale e del suo fornitore: setup anagrafiche → libro ricette → piano di produzione → fabbisogno/shortage → ordini (interno auto-generato + marketplace) → conferma e spedizione lato fornitore → documento DDT → ricezione a magazzino → lotti/scadenze → matching documentale → listino → produzione con scarico FEFO → analytics → passaggio mobile → edge case.

Non in scope: sicurezza/pentest, multi-tenancy isolation (già coperta dal report del 7/6), carico/stress.

## Test environment

| Voce | Valore |
|---|---|
| App | `https://pasticceriaos-production-d14d.up.railway.app` (produzione Railway) |
| DB | Supabase `btxmjfjctrwlmonbnjpz` (ACTIVE_HEALTHY) |
| Esecuzione flussi | **Browser reale (Claude in Chrome)** su Chrome/macOS, desktop 1470px + finestra stretta ~606px |
| Verifiche backend | Query read-only (e poche write documentate) su Postgres via Supabase MCP |
| Suite Playwright | Creata in `e2e/` (vedi Appendix) — **non eseguibile dal sandbox Claude** perché la rete del sandbox è allowlist-only e blocca sia `*.up.railway.app` sia `*.supabase.co`. Pronta per esecuzione locale. |

> **Deviazione strumento (vincolo #5 del brief):** Playwright è stato preparato ma l'esecuzione automatica dal sandbox era impossibile (rete). L'audit è stato quindi **eseguito realmente** nel browser, con evidenze incrociate su DB. La suite Playwright consegnata replica fedelmente lo scenario e contiene asserzioni che riproducono i bug trovati.

## Accounts/roles used

| Agente | Email | Org | account_type |
|---|---|---|---|
| **Pasticceria** | `eeskere33@gmail.com` | "luca toni" (`7bddb0dd…`) | `customer` |
| **Fornitore** | `emirimatteo2@gmail.com` | "matteo emiri" (`38a18dcc…`) | `supplier` |

> ⚠️ **Nota ruoli:** il brief indicava i ruoli invertiti (emirimatteo2=pasticceria, eeskere33=fornitore). Nel DB di produzione i ruoli reali sono quelli in tabella: l'audit usa i ruoli effettivi. Connessione marketplace tra le due org già attiva (chiave PSOS-…), riusata.

Sessioni separate ottenute con logout/login alternati (limite del browser singolo); la suite Playwright usa **storageState separati** (`bakeryContext`/`supplierContext`) come richiesto.

## Data setup eseguito

Tutti i dati sono realistici e coerenti (prezzi all'ingrosso/al dettaglio plausibili, unità corrette, lotti con nomenclatura reale):

- **14 ingredienti** creati da UI lato pasticceria (Burro 82% m.g. 8,90€/kg, Zucchero semolato 1,10€/kg, Uova fresche cat. A 0,28€/pz, Mascarpone, Savoiardi, Caffè espresso, Lievito di birra fresco, Cacao amaro, Cioccolato fondente 70%, Panna 35%, Sale, Vaniglia, Zucchero a velo, Latte) + "farina 00" preesistente.
- **4 ricette** ("libro ricette" manuale, non esiste import massivo → P-03): Croissant classico (20 pz, 7 ingredienti, sfoglia), Tiramisù classico (8 porz.), Torta al cioccolato (12 porz.), Pasta frolla base. Food cost verificato a mano: **Croissant €7,04/batch = €0,35/porz. ✓**
- **Assegnazione fornitore** ai 12 ingredienti del piano (solo da pagina *modifica*, 12 edit singoli → vedi BUG-05).
- **Piano produzione** ven 12/06: Croissant ×3 batch (60 pz), Tiramisù ×2 (16), Torta ×1 (12) = 88 porzioni.
- **Ordine interno** auto-generato dallo shortage: 12 righe, €45,45 → "Inviato".
- **Catalogo fornitore**: 10 referenze. ⚠️ **Inserite via SQL** (deviazione documentata) perché la UI è bloccata da BUG-01. "SMOKE Burro" disattivato da UI (ok).
- **Ordine marketplace** #a16f7a24: 8 righe, **€207,10**, nota di consegna → pipeline completa fino a "Consegnato" + carico a magazzino.
- **DDT-2026-0142** inviato dal fornitore (metadati; nessun file allegabile → P-06). Generato anche un PDF DDT realistico, inutilizzabile per l'upload (campo file assente).
- **4 lotti HACCP** (BU26-0605, FA26-0610, MA26-0608, UO26-0609 con scadenze reali). ⚠️ Registrati **solo dopo aver iniettato via JS il campo `notes` mancante** (BUG-02): la UI pura è rotta.
- **Listino fornitore**: 8 prezzi importati dall'ultimo ordine ricevuto (livello connessione L3).
- Ripristini di cortesia via SQL: riattivata "Vaniglia in bacche" dopo il test di disattivazione (BUG-07: non esiste Riattiva in UI).

## Flussi testati

| # | Flusso | Esito |
|---|---|---|
| A | Login/logout entrambi i ruoli, dashboard iniziale | ✅ (4 login reali, nessun loop) |
| A | Anagrafica ingredienti da UI (14 creazioni + 12 modifiche) | ✅ (bug ingredienti del report 7/6 **fixato**) |
| A | Libro ricette da UI + modifica + food cost/margine | ✅ matematica corretta (margine 72,9% ✓) |
| B | Piano produzione + **fabbisogno**: 12/12 quantità verificate a mano, costo riordino €45,45 ✓ | ✅ **algoritmo core corretto** |
| B | "Genera bozze per fornitore" da shortage | ⚠️ 0 bozze al primo colpo (BUG-05), poi bozza perfetta (12 righe = shortage esatti) |
| B | Ordine marketplace dal catalogo (composer, totale live €207,10 ✓) | ✅ |
| C | Fornitore: lista ordini con filtri, dettaglio, **pipeline Inviato→Accettato→In preparazione→Spedito→Consegnato** | ✅ storico stati completo e timestampato |
| C | Documento DDT al cliente (righe precompilate dall'ordine) | ✅ invio / ⚠️ niente allegato file (P-06) |
| C | Portale token | ❌ **bloccato in produzione** (BUG-04); gestione token invalido ✅ |
| D | "Registra carico a magazzino" → livelli, 8 movimenti `purchase_receipt`, **prezzi ingredienti aggiornati ai prezzi reali d'ordine** (farina 1,20→0,98 ecc.), PO specchio "Ricevuto" | ✅ verificato su DB, idempotente |
| D | Lotti e scadenze (HACCP/FEFO) | ❌ rotti da UI (BUG-02); con workaround: ✅ fino al DB |
| D | Documenti: ricezione DDT, **matching con ordine** | ❌ 16 false anomalie su match perfetto (BUG-03); "Risolvi" singola anomalia ✅ |
| D | Listino: import da ultimo ordine (8 prezzi, badge L3) | ✅ dati / ⚠️ refresh mancante (BUG-09) |
| E | Completamento produzione: **19 movimenti `production_usage` per-ricetta**, FEFO sui lotti (residui esatti: burro 6→4,3 kg ✓), stock aggiornato | ✅ verificato su DB |
| E | Produzione con shortage: permessa senza warning → **stock negativi** | ⚠️ P-01 |
| E | Dashboard/Analytics: spesa mese €207,10, food cost ricalcolato sui nuovi prezzi (croissant €0,35→€0,32, margine 75,3%), top spesa, valore magazzino €166,47 ✓ | ✅ riflettono tutta la giornata |
| F | Mobile: dashboard, liste ordini, dettaglio ordine, documenti, listino, form ingrediente, catalogo fornitore | ✅ layout a card + bottom nav, zero overflow; rilievi minori sotto |
| G | Edge: ordine vuoto, virgole/quantità estreme, token invalido, required mancanti, doppio carico, ingrediente disattivato in ricetta, refresh in composer | ✅ eseguiti, esiti sotto |

---

## Bug trovati

> Formato: ID · titolo · severità · ruolo · area — poi dettagli.

### BUG-01 · Il fornitore non può aggiungere prodotti a catalogo — **Critical** · Supplier · Marketplace/Catalogo
- **Precondizioni:** account supplier loggato.
- **Passi:** `/supplier/catalog` → Nome "farina 00", Unità kg, €/u "0,98" → **Aggiungi**.
- **Atteso:** prodotto aggiunto.
- **Osservato:** sempre **"Invalid input"** (raw), nessun inserimento (verificato anche su DB). Onboarding di un nuovo fornitore impossibile da UI: senza catalogo i clienti non possono ordinare.
- **Causa (verificata nel codice):** il form (`components/marketplace/CatalogManager.tsx`) non ha il campo `sku`; `upsertCatalogItemAction` passa `formData.get('sku')` = **`null`**; `catalogItemSchema.sku = z.string().…optional().or(z.literal(''))` accetta `string|undefined|''` ma **non `null`** (`modules/marketplace/schemas.ts:24`, `modules/marketplace/actions.ts:56`).
- **Fix:** `sku: z.string().trim().max(50).nullish().or(z.literal(''))` **oppure** `sku: formData.get('sku') ?? ''` nell'action; idealmente aggiungere il campo SKU al form (la tabella lo supporta e la UI lo mostra).
- **Nota:** è lo **stesso pattern** del bug ingredienti fixato dopo il report del 7/6 — il fix non è stato propagato alle altre action. Workaround audit: 10 voci inserite via SQL.

### BUG-02 · Registrazione lotti/scadenze sempre rifiutata — **High** · Bakery · Inventory/Lotti (HACCP)
- **Precondizioni:** ordine d'acquisto "Ricevuto".
- **Passi:** dettaglio ordine → sezione *Lotti e scadenze* → N° lotto "BU26-0605", scadenza 10/07/2026 → **Registra**.
- **Atteso:** lotto registrato (alert scadenza, FEFO, tracciabilità).
- **Osservato:** **"Invalid input"** per qualsiasi input valido. L'intera feature HACCP è inutilizzabile da UI.
- **Causa (verificata sperimentalmente):** `recordBatchAction` passa `notes: formData.get('notes')` = **`null`** (il `RegisterBatchForm` non ha il campo notes); `createBatchSchema.notes` non accetta null (`modules/inventory/schemas.ts:88`, `modules/inventory/actions.ts:66`). Iniettando `<input name="notes" value="">` la registrazione va a buon fine → root cause certa.
- **Fix:** `.nullish()` su `notes` (e su `purchaseOrderId` già ok) o coalescenza nell'action. **Azione sistemica consigliata:** audit di *tutte* le action che fanno `formData.get()` su campi non presenti nel form (pattern ricorrente: 3 occorrenze trovate).

### BUG-03 · Matching documento↔ordine: false anomalie al 100% sui documenti del fornitore — **Critical** · Entrambi · Documenti
- **Precondizioni:** DDT inviato dal fornitore da un ordine marketplace (righe generate **dallo stesso ordine**, identiche per nome/qtà/prezzo).
- **Passi:** `/documents` → apri DDT → seleziona l'ordine specchio (8 righe) → **Associa e verifica**.
- **Atteso:** 0 anomalie (corrispondenza perfetta), documento "Verificato".
- **Osservato:** **16 anomalie false** — ogni riga conteggiata sia come "Riga non ordinata" sia come "Riga ordinata mancante". Il controllo documentale (valore chiave del prodotto) produce solo rumore; l'utente dovrebbe "risolvere" 16 falsi positivi a mano.
- **Causa (verificata nel codice e su DB):** `matchDocumentToOrder` matcha solo per `order_line_item_id` o `ingredient_product_id` (`modules/documents/service.ts:128-136`), ma le righe create da `supplierUploadDocument` hanno **entrambi `null`** (il fornitore non conosce gli ID del cliente). Nessun fallback per nome.
- **Fix:** (1) in `supplierUploadDocument` popolare `order_line_item_id`: la provenienza è nota (il doc nasce dalle righe del marketplace order, che hanno il PO specchio); (2) fallback di matching per nome normalizzato (`lower(trim())`, come già fa `receive_marketplace_order`); (3) pre-associare il PO specchio al documento (`purchase_order_id` è null nonostante il legame noto).

### BUG-04 · Portale fornitore token-based rotto in produzione — **High** · Bakery · Portale
- **Passi:** `/suppliers/[id]` → **Genera link portale**.
- **Atteso:** URL `/portal/<jwt>` valido 1 anno.
- **Osservato:** errore **"SUPPLIER_TOKEN_SECRET mancante o troppo corto: configura .env.local"**. Feature distintiva (conferma ordini + upload DDT senza registrazione) totalmente non disponibile in prod; messaggio espone dettagli interni all'utente finale.
- **Causa:** env var `SUPPLIER_TOKEN_SECRET` non configurata su Railway (presente solo in `.env.local`).
- **Fix:** configurare il secret su Railway (+ `SUPABASE_SERVICE_ROLE_KEY`, vedi nota in `.env.local` sul portale "non configurato"); sostituire il messaggio con un errore user-friendly; aggiungere uno startup check/health endpoint che segnali env mancanti al deploy.
- **Gap di testabilità conseguente:** flusso portale (lista ordini, conferma, upload DDT via token) non testabile end-to-end; testata solo la gestione del token invalido (✅ redirect pulito a `/portal/expired`).

### BUG-05 · Nuovo ingrediente senza campo Fornitore → auto-riordino a vuoto con falso successo — **High** · Bakery · Catalog/Ordering
- **Passi:** crea ingredienti da `/ingredients/new` → piano con shortage → **Genera bozze per fornitore**.
- **Atteso:** bozze ordine raggruppate per fornitore; oppure un avviso chiaro.
- **Osservato:** *"✓ 0 bozze ordine create. 12 ingredienti senza fornitore esclusi: …"* — icona di **successo** per un fallimento totale dell'intento. Il form di creazione non permette di assegnare il fornitore (il select esiste solo nella pagina di modifica): per attivare l'auto-riordino l'utente deve riaprire e modificare **uno per uno** tutti gli ingredienti (12 edit nell'audit).
- **Causa:** `app/(main)/ingredients/new/page.tsx` non rende il select `supplierId` (presente in `[id]/page.tsx`).
- **Fix:** select fornitore nel form di creazione; assegnazione massiva dalla lista; messaggio post-generazione come warning con CTA ("Assegna fornitori →").

### BUG-06 · Workspace gating: supplier servito sotto `/dashboard` senza redirect — **Medium** · Supplier · Routing/Middleware
- **Passi:** login supplier → osserva URL; oppure naviga a `/dashboard` da supplier.
- **Atteso:** redirect a `/supplier` (design del middleware).
- **Osservato:** dashboard fornitore renderizzata su `location.pathname = /dashboard` (verificato via JS). Nessun leak dati, ma URL incoerenti, bookmark/deep-link ambigui e gating di fatto non applicato.
- **Causa probabile:** RPC `current_account_type` fallita → `accountTypeKnown=false` → fail-open del middleware (commento nel codice) e fallback dei layout guard che però servono il contenuto sotto il path sbagliato.
- **Fix:** loggare/monitorare il fallimento dell'RPC in prod; in fail-open, far decidere il redirect al layout (redirect server-side a `/supplier`).

### BUG-07 · Ingrediente disattivato irreversibile da UI — **Medium** · Bakery · Catalog
- **Passi:** `/ingredients/[id]` → Disattiva → Conferma disattivazione → riapri la pagina.
- **Atteso:** possibilità di riattivare ("operazione reversibile" è promessa nel pattern analogo dei fornitori); lo schema `updateIngredientSchema` supporta `isActive`.
- **Osservato:** l'ingrediente sparisce dalla lista (solo attivi), la pagina di modifica **non ha alcun bottone Riattiva**. Recupero possibile solo via DB.
- **Fix:** bottone Riattiva nello stato inattivo + filtro "Inattivi" nella lista.

### BUG-08 · "Registra carico" crea fornitori duplicati — **Medium** · Bakery · Marketplace/Anagrafica
- **Osservato:** dopo la ricezione marketplace esistono **due fornitori "matteo emiri"** (manuale `matteoemiri01@gmail.com` + auto-creato `ordini+matteo-emiri@marketplace.local`); il select fornitore degli ingredienti mostra due voci identiche indistinguibili; listini e ordini si spalmano su due anagrafiche.
- **Causa:** `receive_marketplace_order` crea sempre il supplier "marketplace" se non esiste un record con `supplier_org_id` collegato, ignorando omonimi manuali.
- **Fix:** in fase di collegamento o ricezione, proporre il merge/link col fornitore esistente (match per nome/email) o almeno disambiguare la label ("matteo emiri (marketplace)").

### BUG-09 · Import listino: successo senza refresh — **Low** · Bakery · Listino
- **Osservato:** "✓ 8 prezzi importati." ma la pagina resta su "Listino vuoto — 0 voci" e il bottone su "Operazione in corso…" finché non si ricarica manualmente.
- **Fix:** `revalidatePath`/`router.refresh()` dopo successo (stesso pattern già usato per la delete del catalogo).

### BUG-10 · Errori di validazione mostrati raw ("Invalid input") — **Low** · Entrambi · UX errori
- **Osservato:** in BUG-01/02 l'utente vede "Invalid input" senza indicazione del campo. `getErrorMessage` non umanizza gli ZodError (issue già segnalata il 7/6, ancora aperta).
- **Fix:** mappare `error.issues` → messaggio per campo ("SKU non valido", ecc.).

### BUG-11 · Documento fornitore senza fornitore in lista — **Low** · Bakery · Documenti
- **Osservato:** il DDT inviato via marketplace mostra "—"/"Fornitore non collegato" (in lista e in dettaglio) benché provenga da una connessione nota; `supplier_id` resta null.
- **Fix:** risolvere `supplier_id` dall'org mittente al momento dell'insert (`supplierUploadDocument`).

### BUG-12 · Campo "Prezzo di vendita" incoerente con gli altri campi prezzo — **Low** · Bakery · Ricette
- **Osservato:** è un `input type=number step=0.01` con placeholder "es. 4,50": l'inserimento programmatico/incolla con virgola viene **scartato silenziosamente** (value=""); gli altri campi prezzo dell'app sono text con parsing della virgola. La digitazione diretta su Chrome it-IT funziona (normalizza in 1.30), ma su locale non-italiano la virgola può perdersi senza errore.
- **Fix:** uniformare a `type=text inputMode=decimal` + parsing `,`→`.` come `unitPrice` ingredienti.

---

## Incoerenze di prodotto

| ID | Titolo | Severità | Note |
|---|---|---|---|
| P-01 | **Produzione completabile con shortage senza alcun warning → stock negativi** | Medium | Completato il piano con 4 ingredienti mancanti: nessun dialogo; disponibilità a −0,60 l caffè, −120 g lievito, ecc. Lo scarico è corretto e tracciato, ma serve una conferma esplicita ("4 ingredienti andranno in negativo"). |
| P-02 | Piano completato continua a mostrare shortage e CTA "Genera bozze" | Low | Il fabbisogno post-completamento double-conta (necessario vs disponibile negativo → "−1.20 l"); su un piano chiuso la sezione dovrebbe diventare consuntivo. |
| P-03 | **Import "libro ricette" inesistente** | High (gap) | Il brief di prodotto cita l'import ricette; in app non c'è alcun importer (CSV/XLSX/foto/PDF). Caricare 14 ingredienti + 4 ricette a mano ≈ 20-25 min reali: è il muro d'ingresso n°1 per una pasticceria con 50+ ricette. |
| P-04 | Bozze d'ordine con quantità "al grammo" | Medium | L'auto-bozza ordina 0,06 kg di sale / 1,7 kg di burro: nessun arrotondamento a confezione/MOQ/multipli (sacco 25 kg, cartone 10×1 kg…). Un ordine reale non si manda così. |
| P-05 | Soglie minime scorta non impostabili da UI | Medium | `inventory_levels.threshold` è sempre 0; nessun campo nel form ingrediente né nel magazzino (esiste `updateThresholdAction` ma non esposta dove serve). Gli alert "sotto soglia" scattano di fatto solo a stock negativo. |
| P-06 | Documenti = soli metadati, nessun file allegato | Medium | Il fornitore non può allegare il PDF del DDT/fattura (form senza file input); `file_url`/`storage_path` sempre null; il bucket `commercial-documents` è configurato ma inutilizzato in questo flusso. Conservazione documentale reale impossibile. |
| P-07 | Matching documentale manuale nonostante provenienza nota | Medium | Il DDT arriva già legato al marketplace order, ma l'utente deve scegliere a mano l'ordine tra voci ambigue ("matteo emiri · 2026-06-11 · 12 righe" vs "8 righe" — nessun numero ordine). Auto-match possibile al 100%. |
| P-08 | Doppio sistema ordini (interno vs marketplace) con stati e UI diverse | Medium | Bozza/Inviato/Confermato/Ricevuto vs Bozza/Inviato/Accettato/In preparazione/Spedito/Consegnato. La dashboard li mescola ("Ordini in corso 3" = 2 bozze interne stantie + 1 inviato). Il prefill-da-piano esiste solo per gli ordini interni: per il marketplace si ricompone tutto a mano (quantità incluse). |
| P-09 | Wording "COLLEGATI (IN ATTESA DEL PRIMO ORDINE RICEVUTO)" | Low | Resta tale anche con ordini consegnati (dipende dalla ricezione a magazzino?); ambiguo. |
| P-10 | "Consegnato" è dichiarato dal fornitore, non confermato dal cliente | Low/da valutare | Nel mondo reale è il destinatario a confermare la consegna; qui il cliente può solo registrare il carico dopo. Valutare una conferma di ricezione lato bakery. |

## Attriti UX

| ID | Dove | Problema | Fix proposto |
|---|---|---|---|
| UX-01 | StatusActions (entrambi) | Bottoni etichettati con lo stato destinazione ("→ Annullato", "→ Consegnato") anziché con l'azione | "Annulla ordine", "Segna come consegnato" |
| UX-02 | Esito "Genera bozze" | Messaggio di successo "✓" anche quando crea 0 bozze (vedi BUG-05) | Warning + CTA |
| UX-03 | Tabelle ordini/documenti desktop | Riga non cliccabile: hotspot solo sul nome/“Apri” | Riga intera cliccabile |
| UX-04 | `/inventory/batches` | Mostra solo i lotti a scadenza vicina (farina dic-2026 nascosta) senza dichiarare il filtro | Toggle "tutti i lotti" o label del filtro |
| UX-05 | Ricette | Nessun badge se una ricetta contiene ingredienti disattivati (food cost li include comunque) | Flag visivo riga + warning nel piano |
| UX-06 | Catalogo fornitore | Prezzi in formato EN "8.4 €" vs "8,40 €" lato bakery; SKU non inseribile da UI | `Intl.NumberFormat('it-IT')` ovunque; campo SKU |
| UX-07 | Dashboard "Scorte critiche" | Formato "-0.6/0 l" criptico | "−0,6 l (soglia 0)" o icona |
| UX-08 | Composer marketplace | Nessun sanity check su quantità estreme (999999 accettato, totale €8,4M); nessun draft/warning su refresh (dati persi) | Soft-limit + conferma; persistenza bozza |
| UX-09 | "Richiede attenzione" | "1 documento con anomalie di prezzo/quantità" ma le anomalie sono righe non matchate | Copy coerente col tipo anomalia |
| UX-10 | Login/perf | Nessuno spinner sul bottone "Accedi" (pending hardcoded false nel componente) con attese 3-6s | useFormStatus |

## Problemi mobile

Verifica eseguita a ~606px (larghezza minima finestra Chrome macOS; il progetto `audit-mobile` della suite usa iPhone 14 390×844 reale). Impianto mobile **buono**: bottom tab bar (Oggi/Produzione/Magazzino/Menu), liste a card, form ben dimensionati, **zero overflow orizzontale** su tutte le pagine testate (dashboard, ordini, dettaglio ordine, documenti, listino, form ingrediente, catalogo fornitore, portale expired).

| ID | Problema | Severità |
|---|---|---|
| MOB-01 | Card ordini marketplace **senza data** (solo fornitore+stato+totale): ordini indistinguibili | Medium |
| MOB-02 | Tap target sotto i 40px: "Vedi ricezione →" (16px), badge contatore (36px) | Low |
| MOB-03 | Liste lunghe (15 ingredienti) senza ricerca/filtro: scroll-only anche su desktop | Low |
| MOB-04 | Test 390px reale e test tastiera mobile (inputMode decimal sui numerici) delegati alla suite Playwright | n/a |

## Problemi performance percepita

- **Server action lente (3-6s percepiti)** su ogni mutazione (creazione ingrediente/ricetta, transizioni stato, registra carico) — Railway single region + RPC Supabase. Con 14 ingredienti + 4 ricette il data-entry è frustrante anche per la latenza, non solo per i passaggi. Nessun feedback "pending" su vari bottoni (UX-10) amplifica la percezione.
- **Navigazioni read veloci** (<1,5s a caldo). Nessun 500 osservato durante tutto l'audit; un 503 da cold start era noto dal report 7/6 (non riosservato).
- Consiglio: ottimistic UI o almeno spinner coerenti; valutare `revalidatePath` mirati (alcune pagine ricaricano l'intero albero).

## Automazioni mancanti o incomplete

1. **Import ricette/ingredienti** (CSV/XLSX/foto) — P-03, il più impattante per l'adozione.
2. **Soglie scorta configurabili** + riordino suggerito basato su soglie, non solo sul piano del giorno (P-05).
3. **Auto-matching documenti** alla ricezione (P-07 + BUG-03): oggi è manuale e rotto.
4. **Arrotondamento a confezione/MOQ** nelle bozze d'ordine (P-04).
5. **Bridge piano→ordine marketplace**: il prefill dello shortage esiste solo per ordini interni; sul marketplace si ricompone a mano (P-08).
6. **Bulk-assign fornitore** sugli ingredienti (oggi 1 edit per ingrediente).
7. **Notifiche** al fornitore su nuovo ordine (in-app/email): non osservata alcuna notifica; il fornitore deve fare polling della lista.

## Miglioramenti prioritari

1. **Fix sistemico `formData.get() → null` vs Zod** (BUG-01, BUG-02 + audit di tutte le action): poche righe, sblocca catalogo fornitore e HACCP. *Effort: ore.*
2. **Configurare `SUPPLIER_TOKEN_SECRET` (+ service role) su Railway** e startup-check env (BUG-04). *Effort: minuti.*
3. **Matching documentale**: popolare `order_line_item_id` lato supplier-upload + fallback per nome + auto-associazione ordine (BUG-03/P-07). *Effort: 1-2 giorni.*
4. **Fornitore nel form nuovo ingrediente + messaggio "0 bozze" come warning** (BUG-05/UX-02). *Effort: ore.*
5. **Import ricette** anche solo CSV minimale (P-03) + **soglie scorta in UI** (P-05): i due gap che separano il prodotto dal "non posso più farne a meno".
6. Conferma su produzione con shortage (P-01), dedup fornitori marketplace (BUG-08), refresh post-azione (BUG-09), label azioni stato (UX-01).

## Appendix — screenshot/trace/file rilevanti

### Suite Playwright consegnata (in repo)
```
pasticceriaos-web/
├── playwright.config.ts          # 3 progetti: setup / audit-desktop / audit-mobile (iPhone 14)
└── e2e/
    ├── package.json              # self-contained: cd e2e && npm i && npx playwright install chromium
    ├── .gitignore
    ├── helpers/
    │   ├── accounts.ts           # credenziali due ruoli + storageState path (override via env)
    │   ├── audit.ts              # findings JSONL, screenshot, note, perf, overflow/tap-target
    │   ├── dataset.ts            # dataset realistico (ingredienti, ricette, piano, ordine)
    │   └── flows.ts              # ensureIngredient/ensureRecipe/login (locator user-facing)
    └── tests/
        ├── 00-auth.setup.ts            # login 2 ruoli, auth state separati, gating check
        ├── 10-faseA-bakery-setup.spec.ts
        ├── 20-faseB-pianificazione.spec.ts
        ├── 30-faseC-fornitore.spec.ts
        ├── 40-faseD-ricezione.spec.ts
        ├── 50-faseE-produzione.spec.ts
        ├── 60-faseF-mobile.spec.ts
        └── 70-faseG-robustezza.spec.ts
```
**Esecuzione:** `cd pasticceriaos-web/e2e && npm i && npx playwright install chromium && cd .. && npx playwright test` (env: `E2E_BASE_URL`, credenziali via `E2E_*`). Workers=1, retries=0 **intenzionali** (scenario stateful: un retry duplicherebbe dati reali). Artefatti in `e2e/artifacts/` (screenshot, findings.jsonl, perf.jsonl, trace on-failure).
⚠️ La suite **fotografa i bug**: i test marcati BUG-01/02/03 falliscono finché i fix non sono deployati (sono asserzioni di regressione).

### Evidenze raccolte durante l'audit live
- **Screenshot** (sessione Claude in Chrome): dashboard iniziale e finale, fabbisogno 12 shortage, "0 bozze create", ordine €207,10 (composer e dettaglio), pipeline fornitore, "Invalid input" su catalogo e lotti, 16 false anomalie, listino L3, magazzino post-carico, mobile (6 pagine), portale expired.
- **Verifiche DB** (Supabase, lettura): `inventory_levels` (8 righe esatte post-carico), `inventory_movements` (8 `purchase_receipt` + 19 `production_usage`), `ingredient_products.unit_price` aggiornati, `ingredient_batches` (4 lotti, residui FEFO corretti), `commercial_documents`+`document_line_items` (DDT 8 righe, `matched_at` null → conferma BUG-03), `purchase_orders` specchio, `marketplace_orders.status`.
- **Scritture fuori-UI documentate** (workaround a bug bloccanti): insert 10 `supplier_catalog_items` (BUG-01), iniezione campo `notes` per 4 lotti (BUG-02), riattivazione Vaniglia (BUG-07).
- **File generato:** `DDT-2026-0142.pdf` (DDT realistico, inutilizzabile per upload — P-06).
- Report precedente correlato: `REPORT_VALIDAZIONE_PasticceriaOS.md` (7/6) — bug ingredienti allora bloccante risulta **fixato**; pattern identico riemerso altrove (BUG-01/02).

---

## Verdetto

**Stato generale: PRONTO CON RISERVA.**
Il cuore del prodotto — ricette → piano → fabbisogno → ordine → ricezione → produzione → analytics — funziona, è **matematicamente corretto** (ogni numero ricontrollato a mano e su DB) e ben tracciato (movimenti, snapshot prezzi, FEFO, audit trail). Ma oggi un fornitore nuovo **non può nemmeno creare il catalogo**, i lotti HACCP **non si registrano**, la verifica documentale **grida 16 falsi allarmi** e il portale token è spento in produzione. Sono 4 blocchi con fix piccoli (2 sono one-liner di schema + 1 env var): risolti quelli e riverificato, il prodotto è **pronto per un pilot** con 1-2 pasticcerie reali. Per il go-to-market servono poi import ricette, soglie scorta e arrotondamento ordini.
