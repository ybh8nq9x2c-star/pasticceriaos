# REMEDIATION_REPORT — BakeryOS (pasticceriaos-web)

- **Branch:** `security/audit-2026-11` (base `main` @ `b74f31c`, migration 057)
- **Avvio:** 2026-11-26
- **Fonte dei lavori:** prompt di remediation post-audit (W0…W7) + [`SECURITY_REPORT.md`](SECURITY_REPORT.md)

> Regola del report: "verde" significa **eseguito con output**; "scritto" significa che il codice esiste
> ma non è stato eseguito.

---

## 1. Inventario iniziale del branch (prima di ogni modifica)

`git status` al 2026-11-26, nessun commit oltre `b74f31c`:

| File | Stato | Origine | Contenuto |
|---|---|---|---|
| `SECURITY_REPORT.md` | non tracciato | audit statico 2026-11-19 | report F-01…F-17 + matrice di copertura |
| `supabase/migrations_v2/058_security_column_guards.sql` | non tracciato | fix audit | guard di colonna su connessioni (F-02) e ordini marketplace (F-03); `inventory_levels` dal client solo `min_threshold`; nessun DELETE dal client su `sales`, `sale_lines`, `pos_events` (F-07 parziale) |
| `supabase/tests/security_column_guards.test.sql` | non tracciato | fix audit | test di negazione per la 058 (**mai eseguito**) |
| `next.config.mjs` | modificato | F-01 | `images.unoptimized: true` (optimizer immagini spento) |
| `middleware.ts` | modificato | F-05 | `/api/webhooks/*` escluso dal matcher + early-return |
| `modules/marketplace/service.ts` | modificato | F-02/F-03 | messaggi in italiano per i codici P0204, P0310–P0312 |
| `.github/workflows/ci.yml`, `package.json` | modificati | F-02/F-03 | nuovo test SQL in CI e in `test:sql` |
| `AGENTS.md` | modificato | doc | note su webhook fuori dal middleware e guard 058 |

### Decisione sulla 058
**Completata così com'è e committata** (commit "baseline audit"). È coerente e additiva e copre
connessioni, ordini condivisi e proiezione `inventory_levels`. **Non** copre:
- ricevimenti → ordini cross-org;
- scritture dirette sui ledger (`inventory_movements`, `finished_goods_movements`) e sulla proiezione
  `finished_goods_levels`.

Questi punti vanno nelle **nuove** migration di W2 (≥ 059). Il contenuto della 058 non viene duplicato.

---

## 2. Azioni umane

| # | Azione | Stato | Verifica lato repo |
|---|---|---|---|
| H1 | Revocare il token GitHub nell'URL del remote (`.git/config`) | ⏳ pendente | W0 rimuove il token dall'URL |
| H2 | Revocare il token GitHub in `../.github_config` (fuori dal repo) | ⏳ pendente | file **non** copiato nel repo; da cancellare o spostare dopo la revoca |
| H3 | Ruotare le password dei 2 account E2E (presenti in `HEAD`, `e2e/helpers/accounts.ts`) | ⏳ pendente | W0 elimina i fallback |
| H4 | Fornire le nuove credenziali solo via env o secret store | ⏳ pendente | — |

---

## 3. Stato per lavoro

_(aggiornato a ogni commit: vedi sezioni seguenti)_

### W0 — Bonifica credenziali · ✅ fatto (lato repo) · azioni umane H1–H3 pendenti

| Punto | Esito | Evidenza |
|---|---|---|
| Token nel remote | ✅ | `git remote set-url origin https://github.com/ybh8nq9x2c-star/pasticceriaos.git`; `grep -cF <vecchi valori> .git/config` → **0** |
| `../.github_config` | ⏳ umano | Fuori dal repo, **non** copiato dentro; aggiunto a `.gitignore` per sicurezza. Dopo la revoca: cancellarlo o spostarlo fuori da ogni cartella sincronizzata |
| `e2e/helpers/accounts.ts` | ✅ | Niente fallback per email e password; `requireEnv()` con fail-fast |
| `playwright.config.ts` | ✅ | `baseURL` solo da `BAKERYOS_E2E_BASE_URL`, niente default Railway, fail-fast |
| `.gitignore` | ✅ | `.env.*` (eccetto `.env.example`), `.github_config`, `*.secrets`, `e2e/.auth/` |
| Valori vecchi nel working tree | ✅ | `grep -rlF -f <4 valori> .` (esclusi `node_modules`, `.git`, `.next`) → **0 file**. Fuori dal repo l'unico hit è `../.github_config` (H2) |
| Fail-fast E2E | ✅ eseguito | Senza env → `Error: [e2e] BAKERYOS_E2E_BASE_URL mancante…`; con solo l'URL → `Error: [e2e] variabile d'ambiente E2E_BAKERY_EMAIL mancante…` |

**Storia git (nessuna riscrittura, i valori vanno revocati):**
- Le 2 password E2E compaiono nel commit `0f20a6b` (2026-06-11, "fix: chiusura blocchi audit E2E") e
  restano in tutta la storia successiva fino a `ad54f02`.
- I token GitHub **non** compaiono in nessun commit (erano solo in `.git/config` e `../.github_config`).
- Altri hit della scansione (`ghp_`, `github_pat_`, `sk-ant-`, `AIza`, JWT, `sb_secret_`, URL Postgres con
  password, letterali `password/secret`): solo valori non sensibili, cioè la password di default del
  Postgres **locale** della CI (`127.0.0.1:54322`) e due `const SECRET` fittizi nei test unitari POS.

### W1 — Database da zero riproducibile · ✅ fatto (eseguito)

**Problema riprodotto prima del fix** (glob identico alla vecchia CI, su `supabase/postgres:15.20.0.005`):
```
── migrations_v2/017_marketplace_down.sql
── migrations_v2/018_marketplace_harden.sql
psql:migrations_v2/018_marketplace_harden.sql:63: ERROR:  type marketplace_order_status does not exist
```
Quindi la catena "da zero" **non si è mai applicata** con il glob: il job `sql` non poteva essere verde.

**Cosa è cambiato**
| Elemento | Prima | Dopo |
|---|---|---|
| Ordine della catena | glob `[0-9]*.sql` (includeva il rollback 017) | manifest **`supabase/migrations_v2/CHAIN`**: una riga per migration; `017_marketplace_down.sql` in `!exclude` |
| Entry point | loop inline in CI, lista `-f` duplicata in `package.json` | **`scripts/db/chain.sh`** (`check` / `apply` / `test` / `all`), letto da CI, locale e README |
| Ambiente locale | nessuno (Docker spento, niente `psql`) | **`scripts/db/local.sh`**: `supabase/postgres` effimero in Docker, `psql` dentro il container, nessuna installazione sull'host |
| Lista test | duplicata in CI e `package.json` (e diversa) | **`supabase/tests/SUITE`** (7 suite, inclusa `ordering_production_rpc` che prima non girava) |
| Guardia | nessuna | `chain.sh check` fallisce se un file numerato non è in `CHAIN` (verificato con un file sonda `999_probe.sql` → exit 1) |
| README / `supabase/AGENTS.md` | `supabase db push` (legge la cartella legacy!) | catena `migrations_v2` + `CHAIN`, ruolo della cartella legacy, comandi per CI, locale e deploy |

**Bootstrap solo-test** (`supabase/tests/bootstrap/`, attivo solo con `CHAIN_TEST_BOOTSTRAP=1`): due
oggetti che su Supabase hosted crea la **piattaforma** e non il DB, quindi assenti in un Postgres nudo.
- `00_storage_stub.sql`: tabelle `storage.buckets` e `storage.objects` + `storage.foldername()` (servono alla 031).
- `01_auth_gotrue_helpers.sql`: `auth.uid()`/`auth.role()` nella forma GoTrue corrente (leggono anche `request.jwt.claims`).
  L'immagine ha la forma storica, con cui **tutti** i test risultavano "utente non autenticato".

**Bug degli script trovati e corretti durante W1** (per trasparenza):
- La prima versione di `chain.sh` stampava "✓ test SQL verdi" anche con test rossi: `set -e` è inattivo
  dentro le liste `a && b`. Ora ogni `psql` ha un controllo esplicito e il riepilogo elenca i test falliti.
- `receipts_double_count.test.sql` aveva un'aspettativa **anteriore alla 049** (ordine `confirmed`
  dopo un parziale). Aggiornata a `partial`. Lo STEP 2 ora verifica che il path legacy venga **rifiutato**
  (P0040) e che lo stock resti 4: invariante più forte del precedente "finale = 10".

**Esecuzione (output reale, `scripts/db/local.sh all` poi `test`):**
```
✓ CHAIN coerente: 57 migration, 1 escluse
✓ catena applicata: 57 migration          (001…058, senza 017)
ALL MARKETPLACE RLS ASSERTIONS PASSED
ALL PLACE/RECEIVE ASSERTIONS PASSED
ALL RECEIPT UNIT GUARD ASSERTIONS PASSED
FG WASTE ASSERTIONS PASSED
TEST 1 PASS: engine contabilizza correttamente (+4).
TEST 2 PASS: nessun doppio conteggio — stock finale=4, legacy bloccato.
TEST 1 PASS / TEST 2 PASS / TEST 3a/3b/3c PASS (ordering_production_rpc)
security_column_guards: OK                (058: F-02, F-03, F-07 parziale — prima esecuzione)
✓ test SQL verdi: 7 suite
✓ riconciliazione eseguita
```
**Non verificato:** il job `sql` su GitHub Actions (`gh` non autenticato). Il job ora chiama lo
stesso `scripts/db/local.sh all` eseguito qui; Docker è disponibile su `ubuntu-latest`.

### W2 — Isolamento cross-org nei ricevimenti e ledger · ✅ fatto (eseguito)

**Bug confermato a runtime (controllo negativo, prima del fix).** Sul DB di test, con il corpo della 054
e la sola FK sull'id, l'utente dell'org B ha completato un ricevimento che puntava al PO dell'org A:
```
 esito_con_054 → completed
 stato_ordine_di_A → partial      (era confirmed: scrittura cross-tenant + order_status_history in A)
```
Con la 059 lo stesso scenario dà `P0045` e l'ordine di A resta `confirmed` con le righe a 0.

**Migration `059_tenant_guards_receipts_ledger.sql`** (la 058 non è stata duplicata: copre altre tabelle)
| Punto | Implementazione |
|---|---|
| Coerenza ricevimento → ordine/fornitore | `unique (organization_id, id)` su `purchase_orders`/`suppliers` + FK composite `purchase_receipts_{order,supplier}_same_org`. `NOT VALID` + validazione tentata: se ci sono dati storici incoerenti dà un WARNING invece di bloccare il deploy (query in `supabase/diagnostics/tenant_coherence.sql`) |
| Coerenza riga → prodotto | trigger `trg_receipt_line_tenant_guard` (P0045). Le righe non hanno `organization_id`, quindi niente FK composita |
| RPC `complete_purchase_receipt` | ridefinita (corpo 054 + punti `059:`): l'ordine viene bloccato `for update` e la sua org verificata **prima** di ogni scrittura; anche il prodotto della riga deve essere dell'org (P0045) |
| Ledger e proiezioni | `revoke insert, update, delete, truncate` da `anon`/`authenticated` su `inventory_movements`, `finished_goods_movements`, `inventory_levels`, `finished_goods_levels`; `grant update (min_threshold)` su `inventory_levels`; tolte le policy di insert ormai inerti |
| Write-path manuali | nuove RPC definer `record_inventory_movement` e `record_finished_goods_waste` (+ helper `current_org_role()`), che **sostituiscono** gli insert diretti di `modules/inventory/repository.ts`. La guardia "stock sotto zero" è stata spostata dal service (lettura separata dall'insert, quindi race) alla RPC, sotto lock |

**Regressioni** — `supabase/tests/tenant_ledger_guards.test.sql` (nuova, in `SUITE`), tutte eseguite:
| ID | Scenario | Esito |
|---|---|---|
| A1 | B crea un ricevimento che punta al PO di A | `23503` (FK composita) |
| A2 | Riga storica incoerente (vincolo tolto nella transazione), B la completa | `P0045`; ordine A invariato (`confirmed`, 0 ricevuti) |
| A3 | Riga di ricevimento con prodotto di altra org | `P0045` |
| A4 | Caso legittimo: 4 kg su prodotto in g | 4000 g a magazzino, PO `partial` |
| B1–B6 | `authenticated`: INSERT/UPDATE/DELETE su ledger, UPDATE giacenza, UPDATE `finished_goods_levels` | tutti `42501` |
| B7 | UPDATE `min_threshold` | consentito |
| C1–C7 | RPC: conversione kg→g; scarto oltre giacenza `P0052`; `production_usage` a mano `P0051`; ingrediente o ricetta di altra org `P0045`; unità incompatibile `P0212`; viewer `P0050` su entrambe | tutti come atteso |

Test esistenti allineati alla 059 (cambiava il write-path, non la regola):
- `finished_goods_waste`: l'invenduto passa dalla RPC; l'INSERT diretto ora è `42501`.
- `security_column_guards`: la scrittura della giacenza è bloccata già dal privilegio (`42501`); il trigger della 058 (P0213) resta come seconda linea.

**Esecuzione:** catena 001…059 da zero (58 migration); `✓ test SQL verdi: 8 suite`. App: typecheck
pulito, 356/356 unit, build OK.
**Non fatto:** `lib/database.types.ts` non è stato rigenerato (CLI Supabase assente). Le due nuove RPC
sono chiamate con il cast `as never`, come altri punti del codice.

### W3 — Consumo dei lotti in produzione · ✅ fatto (eseguito)

**Bug confermato a runtime (controllo negativo con il corpo della 050, stesso scenario del test):**
```
 EARLY | 300.0000     LATE | 1000.0000     ZUC | 10.0000      ← nessun lotto decrementato
 movimenti_zucchero = 0                                         ← riga saltata in silenzio
 nota_finito_biscotto = (nessuna nota)                          ← finito accreditato senza dichiararlo
```

**Migration `060_production_fefo_lots.sql`**: ridefinisce `complete_production_plan` (v5) senza
toccare la 050. Il ritorno passa da `void` a `jsonb`, quindi DROP + CREATE con i grant identici.
| Punto | Implementazione |
|---|---|
| Lotti nella stessa transazione | per ogni ingrediente: lock della giacenza, **un** movimento `production_usage` (con `qty_before/after`), poi allocazione sui lotti attivi `order by expiry_date, received_at` **for update**; `quantity_remaining` decrementato |
| Collegamento lotto ↔ movimento | nuova colonna `production_batch_ingredients.inventory_movement_id` |
| Stock senza lotto | la quota non coperta da lotti è dichiarata (`untracked_quantity`), non inventata |
| Unità incompatibili | riga **saltata e dichiarata** (`skipped`, motivo `unit_incompatible`): nessun movimento, lotti intatti. Il finito viene accreditato, con `ingredients_complete=false` nell'esito e una nota "consumo ingredienti INCOMPLETO" sul movimento |
| Ingrediente di altra org (F-12) | stessa gestione, motivo `ingredient_other_org`: mai scaricare stock altrui né filtrarlo in silenzio |
| Esito | jsonb restituito **e** salvato in `production_plans.completion_report` (nuova colonna) |
| Garanzie v4 | atomica; ricompletamento → `P0040` |
| UI | `components/production/CompletionReportCard.tsx` nel dettaglio piano: avviso per le righe saltate, lotti FEFO consumati, quota senza lotto. Mapping puro in `modules/production/completion-report.ts` |

**Regressioni eseguite:**
- `supabase/tests/production_fefo_lots.test.sql` (nuova): EARLY 300→0 e LATE 1000→900 (ordine per scadenza, non per inserimento); 2 consumi collegati al movimento (−400 g); zucchero saltato e dichiarato con lotto a 10 e 0 movimenti; Biscotto `ingredients_complete=false`; `completion_report` uguale all'esito; secondo completamento → `P0040` senza nuovi movimenti né consumi.
- `modules/production/__tests__/completion-report.test.ts` (3 test).
- Test esistenti invariati e verdi: `ordering_production_rpc` (complete atomico e idempotente).

**Esecuzione:** 59 migration da zero, `✓ test SQL verdi: 9 suite`; typecheck pulito; 359/359 unit; build OK.
**Nota di comportamento:** i movimenti `production_usage` diventano **uno per ingrediente**: prima
erano uno per riga ricetta, con più righe per lo stesso ingrediente se più ricette lo usavano. Il totale
scaricato è identico.

### W4 — Ricevimenti parziali · ✅ fatto (eseguito, anche con concorrenza reale)

**Bug confermati a runtime (controllo negativo con il corpo della 059, stesso scenario):**
```
 riga e01 (burro 5 kg) quantity_received = 3     ← consegnati 3 kg sulla riga e01…
 riga e02 (burro 5 kg) quantity_received = 3     ← …ma è avanzata ANCHE la riga e02
 riga e03 (uova 30)    quantity_received = 30    ← ordine "cappato" in silenzio
 Uova a magazzino      current_quantity  = 31    ← l'eccedenza è entrata in stock
```

**Migration `061_partial_receipts_coherence.sql`** + [ADR 002](docs/adr/002-over-receipt-policy.md)
| Punto | Implementazione |
|---|---|
| Apertura sessione | RPC `open_receipt_for_order`: find-or-create **atomico** (advisory lock per ordine) + indice unico parziale "un ricevimento aperto per ordine". Se esistono già doppioni storici dà un WARNING invece di bloccare il deploy (`diagnostics/receipts_open_duplicates.sql`). `createReceipt`/`receiveOrderInFull` la usano; rimosso il vecchio "cerca, poi crea" lato app |
| Riga target | `purchase_receipt_lines.order_line_item_id` + trigger di coerenza (la riga d'ordine deve essere dell'ordine del ricevimento, P0045) + backfill degli abbinamenti univoci |
| Completamento v3 | lock delle righe d'ordine; residuo ricalcolato sotto lock; avanzamento **solo** della riga target e **prima** del movimento a magazzino |
| Eccedenze (ADR 002) | default **rifiuto** `P0046`, transazione annullata. La merce extra voluta va in un ricevimento senza ordine. Le righe non collegate seguono una regola deterministica documentata |

**Regressioni eseguite**
- `supabase/tests/partial_receipts.test.sql` (sessione singola): stessa sessione alla seconda apertura con 3/3 righe collegate; 3 kg sulla riga e01 → e01=3 ed **e02=0**; eccedenza uova 31/30 → `P0046`, 0 movimenti, riga invariata; completamento → burro 10 (somma dei movimenti = 10), uova 30, ordine `received`; riga non collegata oltre il residuo → `P0046`; merce non ordinata (panna) → a magazzino, l'ordine avanza solo col burro.
- `supabase/tests/concurrency/receipts_concurrency.sh` (**due sessioni Postgres reali**, solo su DB effimero):
  ```
  C1 OK: aperture concorrenti → stessa sessione
  C2 OK: consegne concorrenti +4/+5 → stock 9, riga ordine 9/10
  C3 OK: +6/+6 su residuo 10 → una consegna posta 6, l'altra rifiutata (P0046)
  ```
- `chain.sh test` esegue `tests/concurrency/*.sh` solo con `CHAIN_TEST_BOOTSTRAP=1` (le fixture vanno committate).
- `tenant_ledger_guards`: fixture adattata (il ricevimento incoerente di A2 viene chiuso prima di aprirne uno legittimo sullo stesso ordine, ora vietato dall'indice).

**Esecuzione:** 60 migration da zero; `✓ test SQL verdi: 11 suite` (10 SQL + 1 concorrenza);
riconciliazione OK; typecheck pulito; 359/359 unit; build OK.
**Rischio residuo (in ADR 002):** `registerScan` incrementa `qty_received` con lettura+scrittura lato app,
quindi due scansioni simultanee della stessa riga possono perdere un incremento prima del completamento.
Il ledger resta coerente con `qty_received`. Fix suggerito: incremento atomico in RPC.

### W5 — POS MiPOS: binding e recupero eventi · ✅ fatto (eseguito) · rollout con azione umana

**Migration `062_pos_binding_recovery.sql`** + [ADR 003](docs/adr/003-pos-webhook-binding.md)
| Punto | Implementazione |
|---|---|
| Segreto per org/cassa | Derivato: `HMAC(POS_WEBHOOK_MASTER_SECRET, provider:config_id:version)` (`modules/pos/secret.ts`). Nel DB solo `secret_scheme`/`secret_version`/`verified_at`. Rotazione con la RPC `rotate_pos_webhook_secret` (owner/baker) |
| Il tenant non sceglie lo schema | Privilegi di colonna su `pos_configs`: `authenticated` scrive solo store/merchant/attivazione. `legacy_global` vale solo per le config pre-062 (backfill) |
| Prova di possesso | `verified_at` alla prima ricevuta firmata con il segreto **di quella config**. Lo squatting di uno `store_id` non porta più a ricevere scontrini altrui. Messaggio di conflitto store reso generico (niente enumerazione) |
| Verifica nel webhook | instradamento (senza effetti) → config → chiave della config → HMAC; store sconosciuto e firma errata danno lo stesso `401` |
| Semantica | `200` = evento scritto in modo durevole (elaborato, duplicato terminale o errore permanente registrato); `4xx` = non ritentare; `503` = transitorio o non configurato |
| Eventi recuperabili | stati `received → processed/reversed/failed` (`pending` migrato e vietato). Il reinvio di un evento non terminale viene **riprocessato**; gli esiti si scrivono solo su eventi non terminali; il replay dall'inbox copre anche `received` |
| Bypass del gate di login | formalizzato: `lib/server-routes.ts` (unico elenco, usato dal middleware), header del route handler, ADR 003; un test verifica che il `matcher` statico sia allineato all'elenco |
| UI | wizard `/sales/pos`: il passo 3 mostra la firma della propria cassa (mascherata, "Mostra"), lo stato di verifica e "Genera nuova firma". Le config legacy vedono "Genera firma dedicata" e il segreto globale non viene mai mostrato |

**Regressioni eseguite**
- Unit (`modules/pos/__tests__`, `lib/__tests__/server-routes.test.ts`), 57 test nell'area:
  - firma con la chiave della propria config → 200; chiave di **un'altra** config → 401; segreto globale su config derived → 401; legacy → 200; store sconosciuto → 401 identico; master assente → 503;
  - duplicato terminale → 200; transitorio → 503; non persistito → 503; permanente → 200 `failed`; JSON non valido → 400 senza query;
  - **retry dopo errore transitorio**: 1° invio `retry`; reinvio (evento `failed`) → riprocessato, `created`, `markProcessed` **una** volta; 3° invio → `duplicate`; `ingestSaleAsSystem` chiamata 2 volte (1 fallita, 1 riuscita);
  - evento rimasto `received` → ripreso; errore di dominio → `failed` (non retry); derivazione deterministica, diversa per config, versione e master.
- SQL `supabase/tests/pos_binding.test.sql`: schema, versione e verifica non scrivibili dal tenant (`42501`, anche in insert); store modificabile; rotazione → v2 con verifica azzerata; viewer `P0050`, altra org `P0044`; `pending` → `23514`; default `received`; idempotenza `23505`; lo stesso scontrino ingerito due volte → **una** vendita, stesso id.

**Esecuzione:** 61 migration da zero, `✓ test SQL verdi: 12 suite`; typecheck pulito; **380/380** unit; build OK.

**Azioni umane per chiudere davvero F-04** (aggiunte alla §2):
| # | Azione | Stato |
|---|---|---|
| H5 | Impostare `POS_WEBHOOK_MASTER_SECRET` (≥ 32 caratteri) su Railway **prima** di attivare nuove casse | ⏳ |
| H6 | Guidare la cassa già collegata (config pre-062, `legacy_global`) a "Genera firma dedicata" e incollarla in MiPOS; poi rimuovere `MIPOS_WEBHOOK_SECRET` | ⏳ |

### W6 — Difetti d'uso quotidiano · ✅ fatto (eseguito)

**Migration `063_daily_use_fixes.sql`**
| Punto | Prima | Dopo |
|---|---|---|
| **Produzione rapida** | ogni rapida creava un nuovo piano per oggi, quindi dalla seconda c'era collisione con `UNIQUE(org, plan_date)` e la correzione dalla dashboard falliva | RPC `quick_produce`: **find-or-create del piano di oggi** (advisory lock org+giorno), +N infornate sulla riga della ricetta **postate subito** (`posted_batch_count`, stesso pattern di `qty_posted`). Funziona più volte al giorno, con piano in bozza **o completato**. `complete_production_plan` v6 posta solo `batch_count − posted_batch_count`, quindi niente doppio scarico; il piano resta non ricompletabile. Logica di contabilizzazione della v5 estratta in `post_production_items` (corpo unico, interno). Il client non può scrivere `posted_batch_count` (privilegi di colonna) |
| **Piani atomici** | insert testata + insert righe separati (piani senza righe); modifica = delete + insert righe | RPC `save_production_plan` (creazione, modifica, settimana tipo): una transazione; infornate postate non rimovibili (`P0047`) |
| **Prenotazioni atomiche** | due insert separati | RPC `create_customer_order`: una transazione, org-check sulle ricette, viewer escluso |
| **Email d'ordine** | l'email partiva **prima** di `mark_order_sent`: con un doppio submit due email, con un errore DB dopo l'invio un'email senza stato | `begin_order_dispatch` (sent + history + `dispatch_id` stabile, esito `pending`) **prima**; poi l'email con `dispatchId` nel payload e header `Idempotency-Key`; infine `record_order_dispatch` (esito solo se l'id coincide). Il doppio submit restituisce `should_dispatch=false`. Badge "Invio da verificare" per `pending`, mai "Inviato" senza attestazione |
| **Invenduto** | vista dai piani completati × resa **corrente**, per giorno; dashboard limitata ai **primi 5** per rimanenza crescente, quindi i prodotti con più avanzo restavano fuori | vista `v_finished_goods_daily_theoretical` rifatta sui **movimenti postati** (riporto + prodotto − venduto netto degli storni − buttato ± rettifiche, giorno Europe/Rome). Compare anche un prodotto con solo riporto. La dashboard mostra **tutti** i prodotti, con il riporto in riga (vale anche per "Chiudi la giornata") |
| **Portale** | token 1 anno; qualunque membro poteva scrivere `portal_token_version` e `supplier_org_id`; letture service-role senza filtro org su documenti e prodotti collegati; `partial` invisibile | TTL configurabile `SUPPLIER_PORTAL_TOKEN_TTL_DAYS` (default **30**, max 365); rotazione solo via RPC `rotate_supplier_portal_token` (owner); privilegi di colonna su `suppliers`; filtro `organization_id` sui documenti e prodotto mostrato solo se della stessa org; `partial` visibile con il suo messaggio |

**Regressioni eseguite**
- `supabase/tests/daily_use.test.sql` (nuova):
  - **A**: 2 rapide nello stesso giorno → 1 piano, riga 3/3, 30 pezzi, −300 g; scendere sotto il postato → `P0047`; completamento → solo il Pane (cornetti fermi a 30, farina −700); rapida a piano **completato** → 40, riga 4/4; client su `posted_batch_count` → `42501`.
  - **B**: riga non valida → `P0045` e **0** testate orfane; prenotazione valida → 2 righe, totale 29.
  - **C**: doppio `begin_order_dispatch` → primo `true`, secondo `false`, stesso id, una sola transizione draft→sent; esito con id sbagliato ignorato; esito corretto → `delivered`.
  - **D**: oggi compaiono entrambi i prodotti; pane con solo riporto 6; cornetti 40 − 3 = 37.
  - **E**: `portal_token_version`/`supplier_org_id` → `42501`; anagrafica modificabile; rotazione → v2; non-owner → `P0050`.
- Unit: badge `pending`, TTL del token (default, env, valori non validi, tetto), mapping del riporto.
- Test esistenti invariati e verdi: `finished_goods_waste` sulla nuova vista, `production_fefo_lots` sul v6.

**Esecuzione:** 62 migration da zero, `✓ test SQL verdi: 13 suite`; typecheck pulito; **385/385** unit; build OK.
**Non coperto da test automatici:** il flusso `changeOrderStatus → email` del service non ha un unit test con mock. Il contratto anti-doppio-invio è verificato a livello RPC (W6-C) e dal typecheck.
