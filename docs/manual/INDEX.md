# Manuale BakeryOS — Indice generale

> Documentazione completa del prodotto, funzione per funzione, basata SOLO su lettura diretta del codebase (`pasticceriaos-web`) e verifiche runtime sui database. Stato di riferimento: commit `371b0c7`, migration `056`, CI attiva.
> Regola editoriale: dove UI, service, SQL o documenti storici divergono, **prevale il codice** e il delta è annotato (VOL-8 §8.1). Le affermazioni non verificate riga-per-riga sono marcate "[non confermato]".

## I volumi

| Vol | Titolo | Per chi è |
|---|---|---|
| **0** | [Glossario e principi invarianti](VOL-0-glossario-invarianti.md) | tutti — da leggere per primo |
| **1** | [Visione prodotto e superfici applicative](VOL-1-prodotto-superfici.md) | founder, nuovi arrivati |
| **2** | [Manuale funzionale per area utente](VOL-2-manuale-funzionale.md) | product, operatori avanzati |
| **3** | [Catalogo route per route](VOL-3-catalogo-route.md) | developer |
| **4** | [Moduli di dominio: service/repository/actions](VOL-4-moduli-dominio.md) | developer |
| **5** | [Database, SQL, RLS, trigger, RPC](VOL-5-database-sql.md) | developer/architetti |
| **6** | [Flussi end-to-end reali](VOL-6-flussi-end-to-end.md) | tutti (tecnico+narrativo) |
| **7** | [Manuale operativo per il team bakery](VOL-7-manuale-operativo.md) | operatori |
| **8** | [Rischi, limiti, debito, roadmap](VOL-8-rischi-debito.md) | founder+developer |

## Le sei matrici obbligatorie (dove trovarle)

1. Route → modulo → action → dati — **VOL-3 §3.1–3.2**
2. Funzione utente → scritture DB → effetti inventariali — **VOL-5 §5.9**
3. Modulo → repository → service → action → RPC — **VOL-4 (coda)**
4. Superficie → guard → attore → rischio — **VOL-1 §1.2**
5. Schermata → frequenza → criticità → priorità UX — **VOL-2 (coda)**
6. Flusso business → source of truth → proiezioni — **VOL-5 §5.8**

## Capire BakeryOS in 10 minuti

1. Due magazzini, non uno: **materie prime** e **prodotti finiti**. (VOL-0 §0.3.1)
2. Nessuno dei due si "aggiorna": si **appendono movimenti**; le giacenze sono somme. (VOL-5 §5.1)
3. Tre soli gesti muovono lo stock: **ricevere** (+materie), **completare la produzione** (−materie/+finiti), **vendere/buttare** (−finiti). Tutto il resto è pianificazione o consultazione. (VOL-6 F3/F6/F7/F12)
4. La cassa parla al sistema da sola (webhook firmato, idempotente); ciò che non riconosce **non corrompe nulla**: resta "da collegare" con rimedio. (VOL-6 F8–F10)
5. Cliente e fornitore possono essere DUE org sullo stesso prodotto: l'ordine marketplace è **una riga sola condivisa**, con transizioni imposte dal DB. (VOL-1 §1.4)
6. Ogni scrittura critica è una **RPC transazionale idempotente**; ogni notte un **controllo automatico** verifica che ledger e proiezioni combacino. (VOL-5 §5.4–5.6)
7. La UI dice la verità o dice che non sa: stati onesti, errori visibili, zero numeri finti. (filosofia ricorrente, VOL-2)

## Usare BakeryOS in una giornata reale (bignami del VOL-7)

**6:30** Oggi → "Da fare adesso" → conferma piani arretrati → copertura stock → ordina i mancanti.
**Mattina** consegne → Ricevimenti (scanner, "Ricevuto tutto") · prenotazioni → tab Ordini cliente.
**Laboratorio** produce → a fine turno **"Completa produzione"** (il momento contabile).
**Banco** il POS lavora da solo; prodotti nuovi = "da collegare" in 10 secondi; ritiro prenotazione = Consegnato **+ registra vendita**.
**Sera** Rimanenze teoriche → **"Registra invenduto"** → lista Ricevimenti "In corso" vuota → buonanotte: alle 02:30 il sistema si auto-verifica, alle 05:00 arrivano gli alert scadenze.

## Invarianti da non rompere MAI (estratto operativo del VOL-0 §0.3)

| # | Invariante | Custode |
|---|---|---|
| 1 | Materie prime e finiti: ledger separati | schema 005/050 |
| 2 | Proiezioni scritte solo da trigger | RLS senza policy di update |
| 3 | Ledger append-only; correzioni = nuovi movimenti | convenzione + audit |
| 4 | Produzione: −materie +finiti, atomico, non ricompletabile | `complete_production_plan` |
| 5 | Vendita/storno/waste: SOLO finiti; mai BOM alla vendita | `ingest_sale*`/`reverse_*`/056 |
| 6 | Ricezione: SOLO materie, unità del prodotto o P0212 | `complete_purchase_receipt` 054 |
| 7 | Unmapped ≠ errore: registrato senza scarico, rimediabile | motore vendite |
| 8 | Idempotenza su ogni evento esterno (UNIQUE + ON CONFLICT) | pos_events/sales/marketplace |
| 9 | RLS ovunque + filtri espliciti dove il leak è fatale | 016/052 + service |
| 10 | Scritture critiche = RPC transazionali con org-check | catalogo VOL-5 §5.4 |
| 11 | Conversioni unità: UNA definizione (021), o converti o fallisci | `unit_conversion_factor` + `units.ts` |
| 12 | La UI non è prova: verità sul DB, sorvegliata ogni notte | 055 |

## Punti ancora da documentare/validare

V. VOL-8 §8.7: internals completi di `portal/service.ts`, commit finale di `recipe-import`, `applyWeekTemplate`, ramo "anomalie>0" della riconciliazione — tutti marcati [non confermato] nei volumi.
