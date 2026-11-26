# e2e — runbook Playwright

Suite E2E "giornata operativa" pasticceria ↔ fornitore. È **stateful**: crea
ingredienti, ricette, ordini, ricevimenti e movimenti di magazzino **reali**
nell'ambiente su cui gira.

> ⛔ **Mai contro la produzione.** Solo `localhost` o uno staging dedicato con
> account di test. Non esiste un URL predefinito: senza `BAKERYOS_E2E_BASE_URL`
> la config si ferma subito (W0).

## 1. Prerequisiti

- Node 22 (`.nvmrc` nella root dell'app).
- Un ambiente target **non di produzione** raggiungibile:
  - locale: `npm run build && npm start` (o `npm run dev`) nella root dell'app,
    con un `.env.local` che punta a un progetto Supabase di **test**;
  - oppure uno staging con il proprio progetto Supabase.
- Due account di test sull'ambiente target, già con organizzazione:
  - una **pasticceria** (`account_type = customer`, home `/dashboard`);
  - un **fornitore** (`account_type = supplier`, home `/supplier`).
- La suite ha un proprio `package.json`: non tocca i `node_modules` dell'app.

## 2. Variabili d'ambiente (tutte obbligatorie)

| Variabile | Contenuto |
|---|---|
| `BAKERYOS_E2E_BASE_URL` | URL dell'ambiente target, es. `http://localhost:3000` o l'URL dello staging. **Mai prod.** |
| `E2E_BAKERY_EMAIL` | email dell'account pasticceria di test |
| `E2E_BAKERY_PASSWORD` | password dell'account pasticceria di test |
| `E2E_SUPPLIER_EMAIL` | email dell'account fornitore di test |
| `E2E_SUPPLIER_PASSWORD` | password dell'account fornitore di test |

Le credenziali **non** stanno nel repo (`e2e/helpers/accounts.ts` fa fail-fast se
ne manca una). Passale da shell, da un secret store o da un file locale
ignorato da git (`.env.*` e `*.secrets` sono in `.gitignore`), per esempio:

```bash
set -a; source ~/bakeryos-e2e.secrets; set +a
```

## 3. Esecuzione

```bash
cd e2e
npm ci
npx playwright install chromium
```

```bash
npm run test:list    # elenca i test: verifica config ed env senza aprire il browser
```

```bash
npm test             # tutta la suite (setup → desktop → mobile)
```

```bash
npm run report       # apre l'ultimo report HTML
```

Gli script girano con `--config=../playwright.config.ts` e
`NODE_PATH=./node_modules`, perché la config sta nella root dell'app ma
`@playwright/test` è installato solo qui.

Per un solo file: `npm test -- tests/90-sales-area.spec.ts`.

## 4. Cosa gira

| Progetto | File | Contenuto |
|---|---|---|
| `setup` | `00-auth.setup.ts` | login dei due account, salva gli auth state in `e2e/.auth/` (ignorato da git) |
| `audit-desktop` | `10`–`50`, `70` | giornata operativa: setup pasticceria, pianificazione, fornitore, ricezione, produzione, robustezza |
| `audit-desktop` | `80-goods-receipts` | import DDT, riga non riconosciuta, discrepanza, ricevimento libero lato fornitore |
| `audit-desktop` | `90-sales-area` | hub vendite, ordini cliente, wizard POS, inbox, redirect legacy |
| `audit-mobile` | `60-faseF-mobile` | flussi chiave su iPhone 14 |

`workers: 1` e `retries: 0` sono voluti: un retry duplicherebbe dati reali.
I file girano in ordine e i successivi usano i dati creati dai precedenti.
Su un ambiente già usato la suite è tollerante (`ensure*` riusa ciò che esiste),
ma per risultati puliti conviene un DB di staging azzerato.

## 5. Output

- `artifacts/html-report/`, `artifacts/test-results/`: report e trace dei fallimenti.
- `artifacts/screenshots/`, `artifacts/*.jsonl`: screenshot e finding dell'audit.
- `artifacts/DDT-2026-0142.pdf`: DDT di esempio usato da `80-goods-receipts`
  (versionato; non cancellarlo).

Tutto tranne il DDT è ignorato da git (`e2e/.gitignore`).
