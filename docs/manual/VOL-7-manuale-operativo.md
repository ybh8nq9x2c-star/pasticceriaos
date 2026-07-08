# VOLUME 7 — Manuale d'uso operativo per il team bakery

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md)
> Scritto per chi lavora in laboratorio e al banco, da telefono, con le mani sporche di farina. Nessun termine tecnico non necessario.

## 7.1 Al mattino (5 minuti, prima di accendere i forni)

1. Apri **Oggi**. Se c'è il blocco **"Da fare adesso"**, quelle 1–2 cose vengono prima di tutto (ordinare i mancanti, ricevere una consegna attesa, confermare/creare il piano).
2. Guarda **"Richiede attenzione"** dall'alto in basso — è già in ordine di gravità:
   - *ricevimenti non contabilizzati*: merce arrivata ma magazzino non aggiornato → apri e completa;
   - *piani da confermare*: produzione di ieri mai chiusa → confermala PRIMA di fare il piano di oggi (altrimenti gli ingredienti risultano ancora in casa);
   - *lotti in scadenza*: guarda i suggerimenti "usali in…";
   - *ordini fermi da 24h*: chiama il fornitore o rimanda.
3. Controlla **"Piano di oggi"** e la card **"Stock per il piano"**: se dice "Mancano N", tocca "Ordina i mancanti" — le bozze si compilano da sole.

## 7.2 Durante la giornata

- **Arriva il corriere** → Ricevimenti → apri l'atteso (o "Nuovo") → scansiona i colli (lotto e scadenza entrano da soli dai barcode GS1) → sistema le righe non riconosciute → **"Ricevuto tutto"** se è arrivato tutto, altrimenti correggi le quantità e completa: il resto rimane aperto per la prossima consegna. *Mai lasciare un ricevimento aperto a fine giornata: finché non completi, il magazzino non sa che la merce esiste.*
- **Finisce un'infornata fuori piano** → Produzione → **Produzione veloce**: ricetta + infornate, fine. Gli ingredienti scendono e i finiti salgono comunque.
- **Vendita fuori cassa** (consegna, evento) → Vendite → **Registra vendita**.
- **Prenotazione al telefono** → Vendite → tab **Ordini cliente** → "+": cliente, data ritiro, cosa. Comparirà da sola nel piano del giorno giusto.
- **La card POS non è verde?** Fai quello che dice il bottone. È UNO solo apposta: "Completa la mappatura" (prodotti nuovi in cassa), "Riprova gli eventi falliti" (inbox), "Collega il POS".

## 7.3 In produzione

- Pianifica la sera prima da **"Riparti da un piano"** (l'ultimo simile è già pronto) e aggiungi gli ordini cliente proposti.
- Il **fabbisogno si aggiorna da solo** mentre componi: righe rosse = non ti basta → "Ordina" lì.
- A produzione FINITA: **"Completa produzione"**. Questo è il momento in cui il sistema scala la farina e conta i cannoncini. Se non confermi: magazzino ingredienti gonfio, banco teorico vuoto, e domani l'app te lo ricorda.

## 7.4 In vendita / al banco

- Con il POS collegato **non devi fare niente**: gli scontrini entrano da soli, anche resi e annulli.
- Prodotto nuovo in cassa? Comparirà come **"da collegare"**: 10 secondi sul wizard (la ricetta giusta è già suggerita), poi "Riprova" sull'evento e anche le vendite già passate si sistemano.
- Ordine cliente ritirato → segna **Consegnato** e — finché il collegamento automatico non esiste — **registra anche la vendita** da "Registra vendita", altrimenti la torta non scala dal banco.

## 7.5 A fine giornata (2 minuti)

1. Oggi → **"Rimanenze teoriche"**: dice quanti pezzi *dovrebbero* essere rimasti.
2. Conta il banco e per ciò che butti: **"Registra invenduto"** — la quantità è già precompilata, scegli il motivo, conferma.
3. Se una rimanenza è **negativa** non è un bug: hai venduto più di quanto risulta prodotto → o manca una produzione veloce da registrare, o un prodotto in cassa è mappato sulla ricetta sbagliata (aprilo dallo scontrino: c'è scritto da quale ricetta ha scalato).
4. Ricevimenti: la lista "In corso" deve essere **vuota**.

## 7.6 Come leggere gli alert (i colori dicono sempre la stessa cosa)

| Colore | Significato | Reazione |
|---|---|---|
| Rosso | anomalia/critico (esaurito, sotto zero, in perdita, fallito) | oggi |
| Ambra | serve un'azione (da confermare, da collegare, parziale, in scadenza) | in giornata |
| Blu | informazione presa in carico | nessuna fretta |
| Verde | fatto/ok | — |
| Grigio | bozza/chiuso/annullato | — |

Una **notifica "Riconciliazione magazzino"** significa che il controllo notturno ha trovato numeri che non tornano: non toccare niente "per sistemare", apri i movimenti dell'ingrediente indicato e — se non ti spieghi il numero — chiedi supporto. *Silenzio notturno = controlli passati.*

## 7.7 Correggere errori SENZA corrompere il sistema

| Errore commesso | Correzione giusta | Perché |
|---|---|---|
| Quantità ricevuta sbagliata (in più) | rettifica dall'ingrediente (delta −, motivo "Correzione") | il ricevimento non si riapre: la storia resta vera |
| Quantità ricevuta in meno | riapri il ricevimento se ancora aperto, o correggi `qty` e ricompleta: posta SOLO la differenza | l'engine è fatto apposta |
| Scontrino sbagliato/di prova | **Storna** dalla lista vendite | i finiti tornano su, la vendita resta in storia come "Stornata" |
| Prodotto mappato sulla ricetta sbagliata | correggi la mappatura nel wizard; per lo scontrino già passato: storna e reinserisci (o accetta la riga com'è) | il relink aggiunge collegamenti, non li sposta |
| Produzione confermata con numeri sbagliati | rettifiche: ingredienti dall'anagrafica, finiti con "invenduto"/produzione veloce | il piano completato non si ricompleta |
| Conteggio fisico diverso dal sistema | scheda ingrediente → **Conteggio** → il numero vero | genera il movimento giusto da solo |

## 7.8 Cosa NON fare mai

- **Non** usare "Acquisto ricevuto" dal movimento manuale per una consegna vera: c'è Ricevimenti (lotti, ordini, documenti passano da lì).
- **Non** registrare l'invenduto dei dolci come scarico ingredienti: sono due magazzini diversi (il bottone giusto è sulla dashboard).
- **Non** aggirare un errore rosso ritentando a raffica: gli errori del sistema (unità incompatibile, transizione non consentita) proteggono i numeri — leggi il messaggio, dice cosa fare.
- **Non** creare un ingrediente doppione se l'avviso "esiste già" compare: frammenta le giacenze per sempre.
- **Non** condividere il link del portale fornitore fuori dal fornitore: chi ha il link vede i suoi ordini (si può revocare dalla scheda fornitore).
- **Non** "sistemare" i numeri con rettifiche senza motivo scritto: la nota è obbligatoria apposta.

---
*Prossimo: [VOLUME 8 — Rischi, limiti, debito](VOL-8-rischi-debito.md)*
