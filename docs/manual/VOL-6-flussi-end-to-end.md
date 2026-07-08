# VOLUME 6 — Flussi end-to-end reali

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md)
> Schema per flusso: Precondizioni → Passi UI → Sistema (moduli+scritture) → Effetti → Failure modes (cosa succede quando va storto — il comportamento è quello implementato, non quello sperato).

## F1 · Creare ingredienti e ricette
**Pre**: org customer. **UI**: `/ingredients/new` (anti-doppione live: "Esiste già Farina 00 — usa quello"; avviso se senza fornitore) → `/recipes/new` (righe BOM da tendina precaricata). **Sistema**: catalog service, insert semplici. **Effetti**: l'ingrediente ha unità CANONICA (tutte le conversioni vi si ancorano); la ricetta abilita produzione, food cost, mapping POS. **Failure**: nome duplicato ⇒ errore UNIQUE leggibile; niente ingredienti ⇒ empty-state con CTA (mai tendina muta, P0-1).

## F2 · Fare un ordine fornitore (email)
**Pre**: fornitore con email; ingredienti con fornitore assegnato. **UI**: da alert magazzino ("Ordina subito", qty 2×soglia) o `/orders/new` → rivedi → "Invia". **Sistema**: `create_purchase_order` (atomica) → `mark_order_sent` (email + `dispatch_outcome` + history). **Effetti**: ordine `sent` con esito VERO; visibile in dashboard "in attesa". **Failure**: email fallita ⇒ `sent_failed`, l'ordine NON finge; ritenti l'invio. Link portale generabile dalla scheda fornitore per conferma remota.

## F3 · Ricevere merce (il flusso più protetto del sistema)
**Pre**: ordine `sent/confirmed` oppure merce libera. **UI**: `/receipts/new` → da ordine (righe attese precompilate col RESIDUO) o import DDT PDF → dettaglio: scanner GS1 / correzioni / risoluzione pending → "Ricevuto tutto" o complete. **Sistema**: goods-receipts service → RPC `complete_purchase_receipt`. **Scritture**: v. MATRICE 2. **Effetti**: stock ↑ nell'unità del prodotto; lotti con scadenza; ordine `partial/received` con cap; DDT archiviato in documenti. **Failure modes**: riga senza prodotto ⇒ blocco con elenco nomi; unità incompatibile ⇒ `P0212`, rollback TOTALE, receipt resta con le sue righe; doppio submit ⇒ delta 0, nessun doppio movimento; parziale oggi + resto domani ⇒ secondo complete posta SOLO il delta; ordine già `received` ⇒ errore esplicito.

## F4 · Aggiornare scorte (rettifica)
**Pre**: differenza contata fisicamente. **UI**: scheda ingrediente `#rettifica` → delta ("+2 kg", motivo preset) o conteggio ("adesso ho 4") → conferma con anteprima before→after. **Sistema**: `recordMovement`/`adjustStockToCount` ⇒ `manual_adjustment` con nota obbligatoria. **Effetti**: livello riallineato, storia intatta. **Failure**: delta 0 ⇒ "nessun movimento da registrare"; viewer ⇒ sola lettura.

## F5 · Pianificare la produzione
**Pre**: ricette attive. **UI**: `/production/new` — precompilato dall'ultimo piano; ordini cliente della data mostrati e aggiungibili; fabbisogno live con "manca X · Ordina→". **Sistema**: `createPlanAction` (draft); preview via `previewRequirementsAction` (mai lista muta: errore visibile con retry). **Effetti**: piano `draft` in lista; NESSUN movimento. **Failure**: sorgente server giù ⇒ banner `loadErrors`+Ricarica; salvare con shortage è PERMESSO (avvisato): la verità sta nella conferma, non nella pianificazione.

## F6 · Completare la produzione (il momento contabile)
**Pre**: piano non completato/cancellato. **UI**: dettaglio piano → CTA sticky "Completa produzione". **Sistema**: RPC v4. **Effetti**: −ingredienti (convertiti), +finiti (`batch×yield`); il teorico di oggi si popola; il piano esce dai "da confermare". **Failure**: ricompletare ⇒ errore (idempotente); ingrediente con unità non convertibile ⇒ SKIP dichiarato (il fabbisogno lo aveva già escluso), diagnosticato da `unit_consistency` e 055; stock che va sotto zero ⇒ AMMESSO (verità onesta, riga rossa in magazzino: si corregge con rettifica, non nascondendo).

## F7 · Vendere prodotti (manuale)
**Pre**: ricette (opzionale per riga). **UI**: `/sales/new` → righe, ID scontrino prefillato → "Registra vendita". **Sistema**: adapter manual → `ingest_sale`. **Effetti**: righe con ricetta ⇒ −finiti; senza ⇒ registrate `unlinked` (recuperabili). **Failure**: stesso externalSaleId ⇒ ritorna la vendita esistente (zero doppioni); errore ⇒ banner, nulla scritto.

## F8 · Collegare il POS (wizard, 6 step)
**Pre**: pannello MiPOS accessibile; `MIPOS_WEBHOOK_SECRET` sul server. **UI**: `/sales/pos`: incolla webhook URL nel pannello cassa → salva Store ID/Merchant (self-service) → dry-run (interpretazione senza scritture) → **scontrino di prova reale** → mappa i prodotti (suggerimento preselezionato, porzioni per le torte) → step 6 verde da solo. "Ricontrolla stato" dopo ogni passo esterno. **Sistema**: `savePosConfig` (guardia: store già di un'altra org ⇒ messaggio umano), `getPosHealth`/`derivePosCta`. **Failure**: firma assente/errata ⇒ 401, nessuna scrittura; org non risolta ⇒ 200 con log `org_not_resolved` (evento NON perso lato cassa, config da sistemare); payload strano ⇒ `invalid_payload` loggato.

## F9 · Scontrino POS end-to-end
Cassa → `POST /api/webhooks/mipos` (HMAC su body grezzo) → `pos_events` (ON CONFLICT ⇒ `duplicate`, stop) → mapping per porzioni → `ingest_sale_system` → −finiti per le righe mappate → `processed` (+eventuale lista `unlinked`). **Void/refund** dello stesso scontrino = evento DISTINTO (`event_type=reversal`) → storno append-only; se la vendita originale manca ⇒ `failed` con messaggio, replayabile dopo l'import della vendita.

## F10 · Gestire prodotti unmapped
**Pre**: card POS "N da collegare" / evento con badge ambra. **UI**: wizard step 5 (o link diretto con highlight dallo scontrino) → "Collega" (ricetta suggerita già selezionata) → inbox → **Riprova** sull'evento. **Sistema**: `upsertPosMapping` → replay ⇒ `relink_sale_lines`: deduce SOLO le righe appena risolte, aggiorna `unlinked` residui. **Effetti**: le vendite passate si sanano, le future filano da sole. **Failure**: relink senza nulla da fare ⇒ "niente da rielaborare" (idempotente).

## F11 · Riconciliare gli eventi POS
**UI**: inbox, banner "N giorni con differenze negli ultimi 7". **Sistema**: confronto giornaliero totali eventi POS vs vendite registrate (`compareDailyTotals`). **Uso**: mismatch ⇒ guarda i `failed` del giorno, replay; oppure scontrini non mappati. NB: eventi a cavallo di mezzanotte possono dare falsi mismatch di giorno (limite noto, VOL-8).

## F12 · Registrare invenduto / leggere le rimanenze teoriche
**Pre**: piano di oggi COMPLETATO (senza, il teorico non esiste — by design). **UI**: dashboard, blocco "Rimanenze teoriche di oggi": `prodotti · venduti · rimanenza` → "Registra invenduto" (qty prefillata alla rimanenza, motivo preset) → conferma. **Sistema**: `recordFinishedGoodsWaste` ⇒ `fg_movements(waste, −n)`. **Effetti**: la vista (056) sottrae il wasted: il banco teorico torna vero; la perdita è misurabile. **Failure**: qty ≤ 0 ⇒ validazione; il teorico può andare NEGATIVO (venduto più del prodotto registrato) ⇒ rosso onesto: manca produzione da registrare (quick produce) o c'è un mapping sbagliato.

## F13 · Gestire ordini cliente
**UI**: `/customers/new` (cliente, ritiro, righe) → lista per data → avanza stato 1-tap → il piano della data li vede e li copre. **Effetti**: SOLO fabbisogno; nessuno stock. **Gap dichiarato**: "delivered" non propone la vendita: al ritiro va registrata a mano da `/sales/new` (altrimenti i finiti non scendono). V. VOL-8.

## F14 · Usare il portale fornitore
**Pre**: link generato dalla scheda fornitore (JWT). **UI fornitore**: apre il link → ordini → conferma / segnala problema / carica DDT-fattura. **Sistema**: verifica token+versione; upload → `commercial_documents` della bakery. **Effetti**: la bakery trova conferma e documento già in coda verifica. **Failure**: token scaduto/ruotato ⇒ `/portal/expired`; il link NON dà accesso ad altro (filtri espliciti per supplier+org).

## F15 · Ordinare via marketplace (bakery↔fornitore connessi)
**Pre**: connessione attiva (chiave riscattata). **UI bakery**: componi dal catalogo → invia. **UI fornitore**: coda → accetta → prepara → spedisci → consegna. **UI bakery**: "Registra a magazzino". **Sistema**: 051 (atomico+idempotente) → trigger stato/history → 053 (PO specchio+carico convertito). **Failure**: doppio click/retry ⇒ STESSO ordine (successo, non errore); transizione fuori sequenza o lato sbagliato ⇒ P0200–P0203 anche via API diretta; doppia ricezione ⇒ stesso PO, zero doppio stock; unità incompatibile ⇒ P0212 rollback.

---
*Prossimo: [VOLUME 7 — Manuale operativo](VOL-7-manuale-operativo.md)*
