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
