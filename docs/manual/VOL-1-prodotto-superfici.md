# VOLUME 1 — Visione prodotto e superfici applicative

> Collana: **Manuale BakeryOS** · [Indice](INDEX.md) · Precedente: [VOL-0](VOL-0-glossario-invarianti.md)

## 1.1 Cos'è BakeryOS

BakeryOS (repo: `pasticceriaos-web`) è un **software operativo verticale per pasticcerie e laboratori** e per i loro **fornitori**, in un unico codebase Next.js 14 + Supabase. Non è un gestionale generico adattato: il modello dati nasce dal ciclo reale di una pasticceria — *compro materie prime → le ricevo → produco → vendo i finiti → butto l'invenduto* — e ogni passaggio ha un write-path transazionale dedicato.

**Problemi che risolve** (ognuno mappa su un modulo reale):
1. **"Quanta farina ho davvero?"** — magazzino materie prime a ledger, con soglie, alert, lotti e scadenze (`inventory`, `goods-receipts`).
2. **"Cosa produco domani e mi basta la roba?"** — piano di produzione con fabbisogno live, copertura stock e bozze ordine dai mancanti (`production`, `reporting`).
3. **"La cassa e il gestionale dicono cose diverse"** — vendite POS ingerite via webhook idempotente, riconciliazione giornaliera POS↔sistema (`pos`, `sales`).
4. **"Quanto mi costa un cannoncino?"** — food cost per porzione dalla BOM con prezzi reali d'acquisto (`reporting`, viste 021).
5. **"Il fornitore mi ha mandato quello che ho ordinato?"** — verifica documenti (DDT/fatture) contro gli ordini con anomalie tipizzate (`documents`).
6. **"Ordinare al fornitore senza telefonate"** — ordini email con esito onesto, oppure marketplace con ordine condiviso e stati tracciati (`ordering`, `marketplace`, `portal`).
7. **"Cosa butto stasera?"** — rimanenza teorica del giorno + registrazione invenduto in un tap (046/056).

**Chi lo usa**: titolare di pasticceria (decisioni, analytics, ordini), addetto laboratorio (produzione, ricezione, scanner), banconista (vendite, ordini cliente), fornitore con account (workspace), fornitore senza account (portale via link). **Deploy**: GitHub → Railway (Node 20), DB Supabase; autodeploy da `main` ([AGENTS.md](../../AGENTS.md)).

## 1.2 Le cinque superfici applicative

| # | Superficie | Path | Autenticazione | Attore |
|---|---|---|---|---|
| 1 | **Bakery workspace** | `app/(main)/*` | Sessione Supabase + org `customer` | Team pasticceria |
| 2 | **Supplier workspace** | `app/supplier/*` | Sessione Supabase + org `supplier` | Fornitore con account |
| 3 | **Portale fornitore** | `app/portal/[token]/*` | **JWT nel path** (`SUPPLIER_TOKEN_SECRET`), zero sessione | Fornitore senza account |
| 4 | **Auth/Onboarding** | `app/(auth)/*`, `app/auth/*`, `app/onboarding` | Pubblica / semi-auth | Chiunque si registra |
| 5 | **Webhook POS** | `app/api/webhooks/[provider]` | **Firma HMAC-SHA256** sul body grezzo | La cassa (server-to-server) |

### Difesa a tre livelli (chi può vedere cosa)

Documentata in [middleware.ts](../../middleware.ts) e [AGENTS.md](../../AGENTS.md), verificata nel codice:

```
middleware.ts                     → gate VELOCE: redirect pre-render per workspace
                                    sbagliato. Fail-open sul solo gating se la RPC
                                    current_account_type fallisce (mai lockout).
requireCustomerSession /          → guard AUTORITATIVI (modules/identity/workspace.ts)
requireSupplierSession              in cima a layout/service. Fail-closed.
RLS Postgres                      → confine definitivo: ogni policy filtra per
                                    current_organization_id() (deterministica, 052).
```

Il **portale** salta l'intera catena Supabase (early-return nel middleware): il suo perimetro è il token — verificato da `modules/portal/service.ts` con client service-role e **filtri espliciti** `supplier_id`+`organization_id` su ogni query, più revoca via `portal_token_version`. Il **webhook** non ha utente: verifica la firma PRIMA di ogni scrittura, risolve l'org da `pos_configs` e opera via service-role con org esplicita su ogni query (`modules/pos/repository.ts`).

### MATRICE 4 — Superficie → guard → attore → rischio

| Superficie | Guard reale | Attore | Rischio caratteristico | Mitigazione |
|---|---|---|---|---|
| Bakery `(main)` | middleware + `requireCustomerSession` + RLS | team pasticceria | operazioni di stock errate | write-path solo via RPC idempotenti; rettifiche tracciate |
| Supplier | middleware + `requireSupplierSession` + RLS | fornitore registrato | vedere dati di altri clienti | RLS `marketplace_*` + policy no-draft (052) + test SQL in CI |
| Portale token | verifica JWT + versione token + filtri espliciti (no RLS di sessione) | fornitore via email | link inoltrato a terzi | scadenza token, revoca `portal_token_version`, perimetro = soli PO del supplier |
| Auth/Onboarding | pubblica; onboarding richiede utente | nuovo utente | account orfano senza org | `requireSession` esige org; onboarding la crea via RPC `create_organization` |
| Webhook POS | HMAC constant-time su body grezzo; 401 se invalida | cassa | payload forgiati / replay | firma pre-scrittura; idempotenza `pos_events`; org da `pos_configs` (UNIQUE per store) |

## 1.3 Percorsi principali per attore

**Titolare (bakery)** — mattina: `/dashboard` ("Oggi": da-fare, attenzione, KPI) → eventuali ordini dai sotto-soglia → sera: rimanenze teoriche + invenduto. Settimana: `/analytics` (food cost, spesa), `/documents` (verifica fatture).
**Laboratorio** — `/production` (piano del giorno, conferma completamento) · `/receipts` (scanner/DDT alla consegna) · `/inventory` (rettifiche).
**Banco/cassa** — `/sales` (hub: vendite, ordini cliente, stato POS) · `/customers/new` (prenotazioni) · `/sales/inbox` quando la card POS segnala problemi.
**Fornitore con account** — `/supplier` (coda "da confermare") → dettaglio ordine → avanzamento stati → `/supplier/receipts` per le proprie spedizioni; catalogo e chiavi in `/supplier/catalog|keys`.
**Fornitore via portale** — apre il link ricevuto per email → lista ordini → conferma / segnala problema / carica DDT-fattura. Fine.

## 1.4 Come si parlano le superfici

- **Bakery ↔ Supplier (marketplace)**: UNA riga `marketplace_orders` condivisa; la pasticceria la crea (`place_marketplace_order`, atomica+idempotente, 051), il fornitore la avanza (trigger DB valida transizione E parte, 014), la pasticceria a `delivered` la **materializza** in PO specchio + carico materie prime (`receive_marketplace_order`, 023+053). History append-only scritta da trigger.
- **Bakery ↔ fornitore senza account**: `purchase_orders` inviati via email (`mark_order_sent`, esito onesto in `dispatch_outcome`) + link portale per conferma/upload.
- **Cassa → Bakery**: webhook firmato → `pos_events` → motore vendite → ledger finiti. Ritorno all'operatore: inbox + card stato POS + riconciliazione giornaliera.
- **Documenti**: il fornitore (portale o workspace) carica DDT/fattura → stessa coda `commercial_documents` della bakery → matching contro l'ordine.

---
*Prossimo: [VOLUME 2 — Manuale funzionale per area](VOL-2-manuale-funzionale.md)*
