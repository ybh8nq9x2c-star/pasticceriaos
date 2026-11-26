# PasticceriaOS

Sistema operativo per la gestione di pasticcerie: ricette, produzione, magazzino, ordini e fornitori.

---

## Stack tecnico

| Layer | Tecnologia |
|-------|-----------|
| Framework | Next.js 14 (App Router, Server Components, Server Actions) |
| Auth & DB | Supabase (PostgreSQL + RLS + SSR cookies) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Deploy | Railway (Node server) |

---

## Avvio locale

**Prerequisiti:** Node.js ≥ 18.17, npm

```bash
# 1. Clona il repository
git clone <repo-url>
cd pasticceriaos-web

# 2. Installa le dipendenze
npm install

# 3. Configura le variabili ambiente
cp .env.example .env.local
# Apri .env.local e inserisci le tue credenziali Supabase

# 4. Avvia il server di sviluppo
npm run dev
```

L'app sarà disponibile su `http://localhost:3000`.

---

## Variabili ambiente

| Variabile | Obbligatoria | Descrizione |
|-----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL del progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Chiave pubblica anonima Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ solo script | Chiave service role (mai in produzione client-side) |
| `NEXT_PUBLIC_APP_URL` | ➖ opzionale | URL pubblico dell'app (usato per redirect OAuth) |

Copia `.env.example` → `.env.local` e compila i valori. **Non committare `.env.local`.**

---

## Database

Il database è gestito da Supabase. **La catena attiva è `supabase/migrations_v2/`**, nell'ordine
elencato in [`supabase/migrations_v2/CHAIN`](supabase/migrations_v2/CHAIN): è l'unico punto di
verità, letto da CI, ambiente locale e deploy.

- `supabase/migrations/` (001–003) è la serie **legacy, morta** (schema pre-rewrite): non va
  mai applicata. Per questo **non** si usa `supabase db push`, che leggerebbe quella cartella.
- I rollback (`*_down.sql`, es. `017_marketplace_down.sql`) stanno in `CHAIN` come `!exclude`:
  non fanno parte della catena in avanti.

```bash
# Locale / CI — DB Supabase usa-e-getta in Docker, catena da zero + test SQL + smoke
npm run db:local          # = bash scripts/db/local.sh all   (serve solo Docker)
bash scripts/db/local.sh stop

# Contro un DB esistente (DATABASE_URL), es. staging
npm run db:chain          # check del manifest + applicazione della catena
npm run test:sql          # esegue supabase/tests/SUITE (ogni test fa ROLLBACK)

# Deploy (staging/prod): applica SOLO le migration nuove di CHAIN, in ordine,
# dal SQL Editor o con psql. Leggi prima supabase/migrations_v2/PRODUCTION_ROLLOUT.md.
```

Una nuova migration va aggiunta **sia** come file `NNN_*.sql` **sia** come riga in `CHAIN`:
`scripts/db/chain.sh check` fallisce se un file numerato non è classificato.

---

## Build produzione

```bash
npm run build
```

Esegue il type check e compila l'app Next.js in modalità produzione. Output in `.next/`.

---

## Start produzione

```bash
npm run start
```

Avvia il server Next.js in modalità produzione. Usa la variabile `PORT` (impostata automaticamente da Railway).

---

## Deploy su Railway

### Prima volta

1. Crea un account su [Railway](https://railway.app) e un nuovo progetto
2. Collega il repository GitHub: **New Project → Deploy from GitHub repo**
3. Seleziona la branch principale (`main`)
4. Railway rileva automaticamente Next.js e usa `npm run build` + `npm run start`

### Variabili ambiente su Railway

Nel dashboard Railway → tuo servizio → **Variables**. Checklist completa:

| Variabile | Obbligatoria | Note |
|-----------|--------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Chiave anon Supabase |
| `SUPPLIER_TOKEN_SECRET` | ✅ per il portale fornitore | ≥32 char, `openssl rand -hex 32`. Senza: la generazione link portale è disabilitata con errore chiaro |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ per portale + storage documenti | Solo server-side, mai nel client |
| `NEXT_PUBLIC_APP_URL` | ✅ in produzione | URL pubblico (es. `https://….up.railway.app`): usato per i link assoluti del portale e i redirect OAuth |
| `SUPABASE_STORAGE_BUCKET` | ➖ | Default `commercial-documents` |
| `CRON_SECRET` | ➖ | Solo se usi l'edge function `expiry-alerts` |

> Dopo aver aggiunto/cambiato variabili, Railway riavvia il servizio: verifica
> dal pannello **Fornitori → scheda fornitore → Genera link portale** che il
> portale risponda correttamente.

### Autodeploy

Ogni push sulla branch `main` trigghera automaticamente un nuovo deploy.

### URL dell'app

Railway assegna un URL pubblico tipo `https://pasticceriaos-web-production.up.railway.app`.
Se usi OAuth o magic link con Supabase, aggiungi questo URL come **Redirect URL** in:
Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.

---

## Supabase — note importanti

- **RLS attivo**: tutte le query sono filtrate per `organization_id` tramite Row Level Security
- **Auth callback**: il route `/auth/callback` gestisce lo scambio codice OAuth/magic-link
- **Multi-tenant**: ogni utente appartiene a un'organizzazione; l'accesso cross-tenant è bloccato a livello DB

---

## Script di sviluppo

```bash
npm run typecheck        # Type check TypeScript (senza compilazione)
npm run lint             # ESLint

# E2E test modulo ordini (richiede .env.local configurato)
npx tsx scripts/test-e2e-ordering.ts
```

---

## Struttura del progetto

```
pasticceriaos-web/
├── app/
│   ├── (auth)/          # Pagine auth: sign-in, sign-up, onboarding
│   ├── (main)/          # App protetta: dashboard, ingredienti, ricette, ecc.
│   ├── api/             # Route API (catalog)
│   └── auth/callback/   # OAuth callback handler
├── components/
│   ├── layout/          # AppSidebar, AppTopbar
│   └── ui/              # Componenti UI riutilizzabili
├── lib/                 # Supabase client, tipi, utils
├── modules/             # Business logic per dominio (catalog, inventory, ordering…)
├── scripts/             # Script di test E2E
└── supabase/
    └── migrations_v2/   # Migration SQL del database
```
