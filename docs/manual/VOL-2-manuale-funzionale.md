# VOLUME 2 — Manuale funzionale per area utente

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md) · Ogni area: scopo → schermate → azioni → cosa succede nel sistema → collegamenti → esempio reale.

---

## 2.1 Oggi (dashboard) — `/dashboard`

- **Scopo**: rispondere a "cosa faccio adesso?" in una schermata. È la pagina più aperta della giornata.
- **Schermate**: unica ([page.tsx](../../app/(main)/dashboard/page.tsx), Server Component, 11 sorgenti dati in `Promise.allSettled` con degradazione onesta per singola sorgente).
- **Cosa vede l'utente**: (0) su mobile "Da fare adesso" — max 2 task prioritari 1-tap (`lib/priority-tasks`); (1) situazione di oggi: piano produzione, copertura stock del piano, ritiri clienti; (2) "Richiede attenzione": ricevimenti non contabilizzati >2h, piani passati da confermare, ricette in perdita, documenti con anomalie, lotti in scadenza ≤3gg, ordini inviati senza conferma >24h; (3) azioni suggerite contestuali; (4) KPI (collassati su mobile); ordini fornitore in 3 secchi onesti (bozze/in attesa/parziali); scorte critiche con riordino 2×soglia; **rimanenze teoriche di oggi con "Registra invenduto"** (P0-3); top spesa.
- **Azioni**: ogni riga è un link all'azione (aprire il piano, ordinare il mancante, confermare, registrare waste). La registrazione invenduto scrive `finished_goods_movements(waste)` via `recordFinishedGoodsWasteAction` con quantità prefillata alla rimanenza e motivi preset.
- **Cosa succede nel sistema**: sola lettura tranne il waste. Se una query fallisce → banner "alcuni dati non disponibili", il resto resta usabile.
- **Collegamenti**: è l'hub verso produzione, ordini, magazzino, documenti, lotti.
- **Esempio reale**: alle 6:30 il titolare apre l'app: "Da fare adesso: ordina 3 ingredienti mancanti" → tap → bozza ordine precompilata; la sera: "Cannoncini: 12 prodotti · 9 venduti · 3 rimasti" → "Registra invenduto" → qty 3 già pronta → conferma.

## 2.2 Produzione — `/production`, `/production/new`, `/production/[id]`, `/quick`, `/template`

- **Scopo**: pianificare cosa produrre e — momento contabile — **confermare** la produzione fatta: −materie prime, +prodotti finiti.
- **Schermate**: lista piani (stati con badge, promemoria "da confermare" per piani passati); **nuovo piano** (server-first P0-1: ricette/suggerimenti/ordini-cliente di oggi precaricati; fabbisogno LIVE via server action con debounce, errori visibili con Riprova; "Riparti da un piano" precompila dall'ultimo; "+ Aggiungi al piano" copre gli ordini cliente della data); dettaglio piano (righe, fabbisogno, bozze ordine dai mancanti via `DraftOrdersButton`, CTA sticky "Completa produzione"); **produzione veloce** (`/quick`: registra a posteriori senza pianificare); **template settimanale** (`/template`: griglia per giorno, applicata al volo).
- **Cosa succede alla conferma**: RPC `complete_production_plan` v4 (050) in UNA transazione: per ogni ingrediente della BOM movimento `production_usage` negativo **convertito all'unità di magazzino** (043; non convertibile ⇒ skip dichiarato); per ogni ricetta movimento `production_output` positivo (`batch_count × yield`); stato piano `completed`. Idempotente: un piano completato non si ricompleta.
- **Regole di dominio**: è l'UNICO punto che tocca entrambi i ledger. Nessun auto-completamento: i piani passati restano "da confermare" finché un umano non conferma.
- **Collegamenti**: ordini cliente (fabbisogno), magazzino (copertura), ordini fornitore (bozze dai mancanti), rimanenze teoriche (produced).
- **Esempio**: martedì sera il capo-laboratorio apre `/production/new`: il form è già precompilato col piano dell'ultimo martedì; vede "2 ordini cliente con ritiro domani" e li aggiunge; il fabbisogno segna burro in rosso → "Ordina →" prefillato; salva. Mercoledì a fine turno: "Completa produzione" → il magazzino ingredienti scende, i finiti salgono.

## 2.3 Vendite (area commerciale unica) — `/sales`, `/sales/new`, `/sales/[id]`, `/sales/pos`, `/sales/inbox`

- **Scopo**: tutto il commerciale in un posto: scontrini (POS+manuali), prenotazioni, salute della cassa. Nav a **voce unica** "Vendite"; tab interne Panoramica · Ordini cliente · POS.
- **Hub `/sales`**: KPI di oggi (n. vendite, incasso, "da risolvere"), **PosStatusCard** (stato onesto: Non collegato / In collaudo / N da collegare / N falliti / Attivo + UNA CTA contestuale da `derivePosCta`, pura e testata), prossimi ritiri, vendite recenti con storno.
- **Vendita manuale `/sales/new`**: righe dinamiche, ricetta opzionale per riga (senza → registrata ma non dedotta), ID scontrino prefillato, CTA sticky. Scrive via `ingestSale('manual')` → RPC `ingest_sale` (atomica, idempotente su org+source+externalSaleId) → `sale_deduction` sui finiti per le righe risolte.
- **Dettaglio `/sales/[id]`**: per ogni riga il prodotto POS e la **ricetta da cui è stato dedotto** (rende ovvio un mapping sbagliato); stati riga `deducted/unlinked/no_bom/unit_mismatch`; link diretto "Collega «SKU»" al wizard con highlight.
- **Wizard POS `/sales/pos`** (6 step con stato reale, mai spunte finte): 1 provider (MiPOS) · 2 webhook URL copiabile + verifica secret server · 3 **store/merchant self-service** (`savePosConfig`, guardia "store già collegato ad altra org") · 4 prova dry-run senza scritture + scontrino reale · 5 mappatura prodotti (suggerimento fuzzy preselezionato, porzioni/unità, aggiunta manuale — superficie UNICA di mapping) · 6 "Tracking attivo" quando `readyForLive`. "Ricontrolla stato" aggiorna dopo passi esterni. `/settings/pos` redirige qui (highlight preservato).
- **Inbox `/sales/inbox`**: ogni evento POS con stato (`Ricevuto/Elaborato/Fallito/Stornato`), righe non collegate, errore leggibile, payload ispezionabile, **Riprova** (replay idempotente / relink post-mapping), banner riconciliazione ultimi 7 giorni (giorni con mismatch POS↔sistema).
- **Regole**: la vendita scala SOLO finiti; unlinked = registrata senza scarico; storno = movimenti inversi; duplicati impossibili per UNIQUE.
- **Esempio**: arriva un void da MiPOS per lo scontrino 4512 → evento `reversal` → storno automatico, i 2 cannoncini tornano nel ledger finiti; in inbox la riga è "Stornato" con link alla vendita.

## 2.4 Ordini cliente — `/customers`, `/customers/new` (tab dell'area Vendite)

- **Scopo**: prenotazioni con ritiro (torte su ordinazione) che **alimentano il fabbisogno di produzione**.
- **Schermate**: lista raggruppata per data ritiro ("★ Oggi"), filtro In corso/Storico, badge canonici, avanzamento stato 1-tap (`pending→confirmed→in_production→ready→delivered`); form nuovo ordine (cliente, data/ora ritiro, righe con ricetta opzionale, acconto/totale — [NewCustomerOrderForm](../../app/(main)/customers/new/NewCustomerOrderForm.tsx)).
- **Cosa succede**: insert ordine+righe (`modules/customers`; ⚠️ non atomico, vedi VOL-8), transizioni validate nel service (`CUSTOMER_ORDER_TRANSITIONS`). **Nessun movimento di stock**: se ne occupa la produzione (fabbisogno) e — manualmente — la vendita al ritiro.
- **Limiti noti**: niente pagina dettaglio; transizioni senza history; "delivered" non propone la vendita (VOL-8).
- **Esempio**: sabato la cliente ordina una Sacher per venerdì: il banconista la registra in 40 secondi; giovedì sera il capo-laboratorio, creando il piano di venerdì, vede "1 ordine cliente con ritiro" e lo aggiunge al piano con un tap.

## 2.5 Ricette — `/recipes`, `/recipes/new`, `/recipes/[id]`, `/recipes/[id]/edit`, `/recipes/import`

- **Scopo**: anagrafica prodotti finiti: BOM, porzioni, prezzo di vendita → base di produzione, food cost e mappature POS.
- **Schermate**: lista (server), dettaglio (BOM, costi — server), edit (form client con props server), **import assistito** (`/recipes/import`, modulo `recipe-import`): testo/CSV/PDF, parsing deterministico + AI opzionale (Gemini/Claude, solo preview: niente si salva senza conferma; senza API key la feature è spenta e l'import resta deterministico), softening errori, mapping colonne, dedupe.
- **Cosa succede**: CRUD via `catalog` service; la BOM è ciò che `complete_production_plan` esplode. Nuova ricetta server-first (P0-1).
- **Esempio**: il titolare incolla il ricettario Excel esportato in CSV → 34 ricette riconosciute, 3 righe ambigue evidenziate → conferma → tutte disponibili per piano e food cost.

## 2.6 Magazzino — `/inventory` (+ `/movements`, `/movement`, `/batches`)

- **Scopo**: giacenze materie prime a eccezioni: dove agire, non un elenco.
- **Giacenze `/inventory`**: card mobile per stato (Sotto zero→"Conta e rettifica", sotto soglia→"Ordina" con qty 2×soglia prefillata, ok→aggiorna), barre livello/soglia, valore; tabella desktop.
- **Movimenti `/movements`**: il ledger leggibile — filtri minimi, **card-stack mobile** (P0-4: tipo, delta firmato colorato, ingrediente, data, nota/`qty_before→after`), tabella desktop. Sola lettura.
- **Movimento manuale `/movement`**: form server-first per `purchase_receipt` (fuori ciclo), `waste` materie prime, `manual_adjustment` (nota obbligatoria), `initial_stock`.
- **Lotti `/batches`**: tracciabilità HACCP dai ricevimenti; in scadenza prima, ricette suggerite per lo smaltimento (FEFO come suggerimento).
- **Rettifica dalla scheda ingrediente** (`StockAdjustPanel`): modalità delta ("+2 kg") o conteggio ("adesso ho X"), motivi preset, conferma esplicita → movimento tracciato con before/after.
- **Regole**: nessuna scrittura diretta ai livelli; ogni correzione è un movimento; drift sorvegliato ogni notte (055).
- **Esempio**: inventario del lunedì: la farina risulta 1,2 kg ma sul bancale ce ne sono 4 → scheda ingrediente → "Conteggio" → 4 → conferma → movimento `manual_adjustment +2,8 kg · Conteggio fisico`, storia intatta.

## 2.7 Ordini fornitore (acquisti) — `/orders`, `/orders/new`, `/orders/[id]`

- **Scopo**: ordinare materie prime a fornitori (tipicamente via email) con **verità sugli esiti**.
- **Schermate**: lista con secchi onesti e `OrdersMobileList`; nuovo ordine (prefill da `?ingredient&qty` degli alert); dettaglio con righe, invio, "Ricevuto" 1-tap (BottomSheet, ricezione totale o del residuo componendo SOLO il goods-receipt engine), registrazione lotti post-ricezione (`RegisterBatchForm`).
- **Cosa succede**: creazione atomica via RPC `create_purchase_order` (048); invio via `mark_order_sent` con `dispatch_outcome` (sent_ok/sent_failed…, 047) — se l'email fallisce l'ordine NON finge di essere inviato; stati `partial/received` scritti SOLO dal receipt engine (049).
- **Esempio**: alert burro sotto soglia → "Ordina subito" → bozza con 2×soglia → invia → domani alla consegna: "Ricevuto" 1-tap → stock su, ordine `received`.

## 2.8 Ricezione merce — `/receipts`, `/receipts/new`, `/receipts/[id]` (speculare in `/supplier/receipts`)

- **Scopo**: l'**unico ingresso a magazzino**: DDT, scanner, conferme. Engine unico bakery+supplier (`ReceiptViews` con `mode`).
- **Schermate**: indice con tab stato (In corso/Attesi/Completati/Discrepanze) e filtro fornitore; nuovo (import DDT PDF **oppure** ricevimento da ordine/libero); dettaglio: ScannerPanel (html5-qrcode, GS1 completo), righe con matching (pending→scelta prodotto con suggerimenti / creazione al volo con apprendimento barcode), quantità/lotto/scadenza/discrepanza per riga, "Ricevuto tutto" 1-tap, `CompleteReceiptBar` sticky.
- **Cosa succede al completamento**: RPC `complete_purchase_receipt` (049+054): per riga, delta = `qty_received − qty_posted` → movimento `purchase_receipt` **nell'unità del prodotto** (conversione metrica con nota "convertito da…", incompatibile ⇒ errore P0212 e rollback); lotto HACCP se c'è scadenza; avanzamento ordine col cap all'ordinato; stato receipt derivato (completed/partial/discrepancy). Ricompletare posta solo il nuovo delta.
- **Import DDT**: testo estratto dal PDF → parser tollerante (header, righe qty+unità, SKU, lotti; warnings espliciti) → documento SEMPRE archiviato → righe matchate a soglia; match con **unità non convertibile decade a pending con avviso** (mai "25 kg"→"25 g").
- **Esempio**: arriva il corriere: l'addetto apre il ricevimento atteso dall'ordine, scansiona i colli GS1 (lotto+scadenza entrano da soli), un codice ignoto → riga pending → lo associa e il barcode viene imparato; "Ricevuto tutto" → contabilizzato, lotti creati, ordine `received`.

## 2.9 Documenti — `/documents`, `/documents/new`, `/documents/[id]`

- **Scopo**: DDT/fatture/conferme verificati contro gli ordini; prezzi ingredienti aggiornati dalle fatture verificate.
- **Schermate**: lista con filtri di stato (`received/matched/anomaly/archived`) e conteggi; upload; dettaglio con righe e `MatchPanel` (associazione ordine + esecuzione verifica + risoluzione anomalie una a una).
- **Cosa succede**: matching a 3 livelli (id riga → ingrediente → nome normalizzato), varianze quantità/prezzo con epsilon, `extra_item`, `total_mismatch`; re-match idempotente (reset anomalie precedenti); ultima anomalia risolta ⇒ `matched`; fattura `matched` ⇒ `ingredient_products.unit_price` aggiornato (source of truth della cache prezzi). Auto-associazione del PO specchio per i documenti nati dal marketplace.
- **Esempio**: fattura del molino con la farina a 1,32 €/kg contro 1,25 ordinato → anomalia `price_mismatch` con atteso/reale → il titolare la risolve annotando l'aumento → documento verificato, food cost aggiornato al prezzo vero.

## 2.10 Ingredienti — `/ingredients`, `/ingredients/new`, `/ingredients/[id]`

- **Scopo**: anagrafica materie prime (nome, unità canonica, SKU, prezzo cache, fornitore preferenziale, barcode).
- **Schermate**: lista con filtro "senza fornitore" e **assegnazione massiva** (senza fornitore = fuori dal riordino automatico, con barra sticky mobile); nuovo con **anti-doppione** ("Esiste già… usa questo") server-first; scheda con edit + rettifica stock + disattivazione (soft-delete).
- **Collegamenti**: barcode imparati dai ricevimenti; prezzo aggiornato da fatture verificate; unità canonica = riferimento delle conversioni.
- **Esempio**: dopo un import DDT sono nati 3 ingredienti nuovi senza fornitore → lista → filtro → selezione multipla → "Assegna fornitore" → rientrano nel riordino.

## 2.11 Marketplace (lato bakery) — `/marketplace/suppliers`, `/marketplace/orders*`

- **Scopo**: ordinare da fornitori **connessi** su BakeryOS: catalogo vivo, ordine condiviso, stati tracciati, ricezione integrata.
- **Schermate**: fornitori connessi + riscatto chiave (`PSOS-…`); composizione ordine dal catalogo (`OrderComposer`, idempotency key per mount, submit disabilitato in pending); lista ordini (data/righe/totale/badge canonici); dettaglio condiviso (`OrderDetail`): righe snapshot, azioni di transizione lato-corrette, storico stato, upload/verifica documenti, **"Registra a magazzino"** a `delivered` (idempotente).
- **Cosa succede**: `place_marketplace_order` (051) = header+righe+submit in una transazione, retry con stessa key = successo; trigger DB validano transizione E parte (P0200–P0203) e scrivono history; `receive_marketplace_order` (023+053) crea PO specchio UNIQUE + carico con unità compatibili.
- **Esempio**: la pasticceria compone 25 kg farina + 10 l panna dal listino del molino connesso → "Invia" → il molino lo vede submitted, lo porta a delivered → "Registra a magazzino": +25.000 g e +10 l, PO specchio archiviato, documenti verificabili.

## 2.12 Supplier workspace — `/supplier/*`

- **Scopo**: il gestionale del fornitore: coda ordini in entrata, catalogo/listino, chiavi di connessione, spedizioni, analytics clienti.
- **Schermate**: dashboard (KPI pipeline; "Da fare adesso" mobile quando ci sono submitted; ordini recenti; top clienti/prodotti); ordini con filtri stato (draft esclusi **anche da RLS**, 052); dettaglio con transizioni supplier-side; catalogo CRUD (nome, unità, prezzo — snapshot alla vendita); chiavi (mostrate UNA volta, revocabili); receipts (stesso engine, `mode='supplier'`); clienti connessi; analytics (022).
- **Esempio**: il molino al mattino: "3 ordini da confermare" → li accetta → prepara → spedito → consegnato; il suo cliente riceve e carica a magazzino da sé.

## 2.13 Portale fornitore (token) — `/portal/[token]/*`

- **Scopo**: far confermare/documentare gli ordini a fornitori **senza account**, da telefono, senza password.
- **Schermate**: redirect a lista ordini del supplier del token; dettaglio con righe e `PortalOrderActions`: **conferma** (48px), **segnala problema** (testo), **upload DDT/fattura** (entra nella coda documenti della bakery); pagina `expired` per token scaduti/revocati.
- **Sicurezza**: JWT HS256 firmato con `SUPPLIER_TOKEN_SECRET`, `portal_token_version` per revoca; ogni query filtra supplier+org via service-role. Superficie SEPARATA dal marketplace.
- **Esempio**: il piccolo produttore di uova riceve l'email, tocca il link, vede l'ordine, "Confermo", carica la foto del DDT: la pasticceria trova tutto già in `/documents`.

## 2.14 Analytics — `/analytics`

- **Scopo**: consultazione: stato scorte aggregato, valore magazzino, spesa mensile (6 mesi), top ingredienti per spesa, **food cost per ricetta** con margine e prezzi suggeriti.
- **Onestà dei numeri**: tutto da query/viste reali; '—' quando mancano dati; ricette con ingredienti non convertibili escluse dichiaratamente dal food cost.
- **Limite noto**: le domande "commerciali" (best seller, incasso vs POS) arriveranno con dati POS reali (VOL-8).

## 2.15 Impostazioni — `/settings`

- **Scopo**: profilo organizzazione + profilo fiscale (P.IVA con checksum offline, dati manuali, idoneità fatturazione). Il POS è stato promosso all'area Vendite (qui resta il link).
- **Limite noto**: nessuna gestione membri/ruoli da UI (i ruoli esistono nel dominio: `viewer` bloccato sulle scritture nei service).

## 2.16 Lotti & scadenze (vista trasversale)

Cron giornaliero `expiry-alerts` (05:00 UTC, edge function + pg_cron 034): lotti con scadenza ≤3gg ⇒ notifica in-app per org (dedup giornaliera) + email Resend se configurata (altrimenti lo dichiara). Dashboard: blocco scadenze con ricette suggerite. Le azioni di smaltimento restano manuali (waste finiti per l'invenduto; waste materie prime da `/inventory/movement`).

## 2.17 Notifiche & riconciliazione (vista trasversale)

`notifications` alimentate da: scadenze (034) e **riconciliazione notturna** (055: drift raw/finiti, unità incoerenti, multi-org — notifica SOLO se ≠0, log sempre in `reconciliation_runs`). Silenzio = controlli passati (e il log lo prova).

---

## MATRICE 5 — Schermata → frequenza d'uso → criticità operativa → priorità UX

| Schermata | Frequenza | Criticità (se sbaglia) | Stato UX | Priorità residua |
|---|---|---|---|---|
| Dashboard Oggi | ×N/giorno | media | ottima (task-first, degraded-mode) | — |
| Produzione: conferma piano | 1–2/giorno | **massima** (doppio ledger) | buona (CTA sticky, idempotente) | — |
| Ricezione: dettaglio+scanner | 1–5/giorno | **massima** (stock in) | ottima | auto-archivio draft (P1) |
| Vendite hub / inbox POS | continua | alta | ottima (CTA contestuale) | pilota reale |
| Wizard POS | una tantum | alta (setup) | buona | secret per-org (P1) |
| Ordini fornitore | 2–5/sett | alta | buona | bozza aggregata per fornitore (P1) |
| Ordini cliente | quotidiana | media | sufficiente | dettaglio+history, ritiro→vendita (P1) |
| Magazzino giacenze/rettifica | quotidiana | alta | ottima | — |
| Movimenti | consultazione | bassa | buona (mobile P0-4) | — |
| Documenti | 2–5/sett | media | sufficiente | auto-match all'upload (P1) |
| Ricette / import | settimanale | media | buona | — |
| Ingredienti | settimanale | media | buona | merge in Magazzino (P2) |
| Marketplace / Supplier | dipende dal fornitore | alta | buona | — |
| Portale token | per ordine | media | buona | audit dedicato (P2) |
| Analytics | settimanale | bassa | buona | KPI vendite post-POS |
| Impostazioni | rara | bassa | sufficiente | membri/ruoli (P2) |

---
*Prossimo: [VOLUME 3 — Catalogo route](VOL-3-catalogo-route.md)*
