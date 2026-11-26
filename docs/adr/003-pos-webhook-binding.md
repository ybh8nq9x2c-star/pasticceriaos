# ADR 003 — Binding cassa ↔ tenant e semantica del webhook POS

**Data:** 2026-11-26 · **Stato:** implementato (migration 062) · **Area:** pos / sales / middleware
**Origine:** remediation W5 (`REMEDIATION_REPORT.md`), finding F-04/F-05/F-06 di `SECURITY_REPORT.md`

## Contesto

- `MIPOS_WEBHOOK_SECRET` era **uno solo per tutta l'installazione**: ogni cassa firmava con lo stesso valore,
  quindi dal secondo cliente POS in poi un tenant poteva firmare scontrini e storni a nome di un altro
  (l'org viene scelta dallo `store_id` dentro il payload).
- Lo `store_id` si rivendica in self-service senza prova di possesso (squatting).
- Il webhook rispondeva `200` anche su config mancante, org non risolta ed errori interni: la cassa non
  ritentava mai. In più un reinvio veniva scartato come `duplicate` anche se il primo tentativo non era
  arrivato in fondo (evento `pending`/`failed`).
- Il webhook passava il gate di login con una modifica del middleware non dichiarata come eccezione.

## Decisione

1. **Segreto per configurazione, derivato.**
   `secret = HMAC-SHA256(POS_WEBHOOK_MASTER_SECRET, "bakeryos-pos:v1:<provider>:<config_id>:<version>")`.
   - Nel DB non c'è nessun segreto: solo `secret_scheme` e `secret_version`. Un dump del DB non permette di firmare.
   - Il segreto di una cassa non permette di firmare per un'altra (HMAC come PRF).
   - Rotazione: RPC `rotate_pos_webhook_secret`, che fa version+1 e azzera la verifica. Il vecchio segreto smette subito di valere.
   - Il titolare lo vede solo nel wizard (owner/baker, mai il viewer).
   - Scartato: salvare il segreto cifrato in tabella. Il DB diventerebbe materiale sensibile e servirebbe una
     gestione chiavi in più, senza vantaggi rispetto alla derivazione.
2. **Prova di possesso.** `pos_configs.verified_at` si valorizza alla prima ricevuta firmata con il segreto
   di quella config. Lo squatting di uno `store_id` diventa inutile: la cassa della vittima non conosce il
   segreto della config dell'attaccante, quindi i suoi scontrini vengono rifiutati invece di finire
   all'attaccante. Resta solo il disturbo sulla rivendicazione, con messaggio d'errore generico.
3. **Il tenant non sceglie lo schema.** Privilegi di colonna: `authenticated` può scrivere solo
   store/merchant/attivazione. `legacy_global` esiste solo per le config pre-062, che continuano a
   funzionare con `MIPOS_WEBHOOK_SECRET` finché il titolare non genera la firma dedicata (rotazione).
4. **Ordine di verifica.** Instradamento (store/merchant) letto dal payload non verificato e **senza
   effetti** → config → chiave di quella config → HMAC sul body grezzo → solo dopo, parse e scrittura.
   Store sconosciuto e firma errata rispondono allo stesso modo (`401`), così non si possono enumerare gli store.
5. **Semantica delle risposte.**
   - `200` solo dopo l'**accettazione durevole** (riga `pos_events` scritta), oppure per un duplicato già
     elaborato, oppure per un errore **permanente** registrato (visibile e rielaborabile in inbox).
   - `4xx` per ciò che non va ritentato (firma, JSON, provider).
   - `503` per errori **transitori** o server non configurato: la cassa ritenta.
6. **Eventi recuperabili.** Stati espliciti di `pos_events`: `received → processed | reversed | failed`.
   - Un reinvio di un evento **non terminale** (`received`/`failed`) viene riprocessato, non scartato.
   - Gli esiti si scrivono solo su eventi non terminali, quindi un tentativo concorrente riuscito non viene sovrascritto.
   - Le RPC a valle sono idempotenti (`sales` UNIQUE): lo stesso scontrino produce una sola vendita.
   - Il replay dall'inbox copre `failed` e `received`.
7. **Eccezione al gate di login dichiarata.** `lib/server-routes.ts` è l'unico elenco delle route
   server-to-server, usato da `middleware.ts`. Un test verifica che il `matcher` statico escluda esattamente quelle.

## Conseguenze / rollout

- In produzione va impostata `POS_WEBHOOK_MASTER_SECRET` (≥ 32 caratteri) **prima** di attivare nuove casse.
- Il cliente già collegato resta su `legacy_global`: per chiudere F-04 va guidato a generare la firma
  dedicata dal wizard e incollarla nel pannello MiPOS. Dopo, `MIPOS_WEBHOOK_SECRET` si può rimuovere.
- Ruotare il master invalida tutti i segreti derivati: è un'operazione d'emergenza, non di routine.
