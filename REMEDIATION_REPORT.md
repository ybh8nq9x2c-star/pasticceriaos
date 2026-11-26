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
