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
