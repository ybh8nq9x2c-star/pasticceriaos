# ADR 002 — Eccedenze in ricezione e avanzamento per riga d'ordine

**Data:** 2026-11-26 · **Stato:** implementato (migration 061) · **Area:** goods-receipts / ordering / inventory
**Origine:** remediation W4 (`REMEDIATION_REPORT.md`)

## Contesto

`complete_purchase_receipt` (054/059) aveva tre difetti:
- registrava il movimento a magazzino **prima** di limitare (`least`) l'avanzamento dell'ordine: un'eccedenza
  entrava in stock mentre l'ordine veniva "cappato" in silenzio (verificato: 31 uova a magazzino, ordine fermo a 30);
- l'avanzamento era **per ingrediente**: con lo stesso prodotto su più righe d'ordine, un carico da 3 kg
  faceva avanzare entrambe le righe (6 kg registrati contro 3 consegnati);
- la sessione di ricevimento si apriva con due richieste separate (cerca, poi crea).

## Decisione

1. **Eccedenza = rifiuto (default).** Se il delta di una riga supera il residuo della riga d'ordine
   (ricalcolato sotto lock), la RPC alza `P0046` e annulla **tutto** il completamento: nessun movimento,
   nessun avanzamento. Il messaggio indica la riga e la quantità in eccesso.
   - Merce in più ma voluta: si registra in un **ricevimento senza ordine**. È un gesto esplicito,
     tracciato come carico a sé e visibile alla verifica documenti (DDT/fattura) come differenza.
   - Non c'è un'accettazione "over-receipt" automatica: renderebbe di nuovo plausibile un numero sbagliato.
     Se servirà, sarà un flag esplicito per riga che genera un'anomalia documento (`quantity_mismatch`), non un default.
2. **Avanzamento solo sulla riga target.** Ogni riga di ricevimento creata da un ordine porta
   `order_line_item_id`. Il completamento evade **solo** quella riga. Per le righe non collegate
   (aggiunte a mano o da scanner):
   - prodotto su **una** riga d'ordine → quella riga, e il collegamento viene registrato;
   - prodotto su **più** righe d'ordine → riempimento deterministico per `id` fino al residuo di ciascuna;
     l'eccedenza oltre il totale è rifiutata (`P0046`);
   - prodotto **non** nell'ordine → merce non ordinata: entra a magazzino, l'ordine non avanza.
3. **Ordine delle operazioni** (stessa transazione, lock sempre nello stesso ordine: ricevimento →
   ordine → righe d'ordine → righe ricevimento → giacenze): verifica residuo e avanzamento della riga
   d'ordine, **poi** il movimento a magazzino e il lotto.
4. **Una sessione aperta per ordine.** `open_receipt_for_order` (find-or-create) con advisory lock per
   ordine e indice unico parziale su `purchase_receipts(purchase_order_id)` per gli stati
   `draft/expected/partial`. Due operatori ottengono la stessa sessione.

## Conseguenze

- Uno scontrino di consegna "gonfiato" non arriva più a magazzino in silenzio: l'operatore vede l'errore e corregge.
- La riconciliazione ordine↔magazzino torna esatta per riga.
- Se in un ambiente esistono già ordini con più ricevimenti aperti, la 061 **non** crea l'indice e lo dichiara
  (WARNING + `supabase/diagnostics/receipts_open_duplicates.sql`). L'advisory lock protegge comunque le nuove aperture.
- Rischio residuo noto: `registerScan` (scanner) aggiorna `qty_received` con lettura+scrittura lato app. Due
  scansioni simultanee della stessa riga possono perdere un incremento **prima** del completamento. Il
  completamento resta coerente (posta il delta reale di `qty_received`). Fix suggerito: incremento atomico in RPC.

## Verifica

`supabase/tests/partial_receipts.test.sql` (sessione singola) e
`supabase/tests/concurrency/receipts_concurrency.sh` (due sessioni Postgres reali: aperture concorrenti,
consegne +4/+5 → 9, consegne +6/+6 su residuo 10 → una rifiutata).
