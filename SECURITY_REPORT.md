# SECURITY_REPORT — BakeryOS (pasticceriaos-web)

- **Branch:** `security/audit-2026-11` (da `main` @ `b74f31c`, migration `057`)
- **Data:** 2026-11-19
- **Tipo:** audit **statico** autorizzato (codice applicativo, migration `supabase/migrations_v2/001–057`, configurazione, dipendenze).

> ⚠️ **Limite dichiarato.** Sulla macchina di audit Docker non è avviato e mancano Supabase CLI e `psql`.
> Nessun PoC è stato **eseguito a runtime**. Ogni finding è dimostrato **leggendo il codice e le policy
> effettivamente in vigore** (ultima definizione di ogni policy/funzione lungo la catena di migration).
> I PoC SQL/HTTP sotto sono pronti da lanciare su Supabase locale. Le voci che richiedono una prova
> dinamica sono marcate **N.D.** nella matrice di copertura (§4).

---

## 0. Stato remediation (stesso branch)

| Finding | Stato | Cosa è cambiato | Verifica |
|---|---|---|---|
| F-01 | **Mitigato** (upgrade di Next ancora da fare) | `next.config.mjs`: `images.unoptimized: true` | Runtime: `GET /_next/image?url=/icon.svg…` → **404** |
| F-05 | **Risolto** | `middleware.ts`: `api/webhooks/` escluso dal matcher + early-return esplicito | Runtime: `POST /api/webhooks/mipos` con firma errata → **401 dall'handler** (non più 307 → /login). Regex del matcher: `/api/pos/*` resta protetto |
| F-02 | **Risolto (da applicare al DB)** | Migration `058_security_column_guards.sql`: trigger `trg_connection_column_guard` (parti immutabili, il client può solo revocare; riattivazione solo tramite chiave) | `supabase/tests/security_column_guards.test.sql` (in CI e in `npm run test:sql`). **Non ancora eseguito** (DB locale non disponibile) |
| F-03 | **Risolto (da applicare al DB)** | 058: trigger `trg_marketplace_order_immutable_cols` (cliente, fornitore, connessione e idempotency immutabili; i timestamp li scrive solo il guard di stato) | Idem |
| F-07 | **Parziale (da applicare al DB)** | 058: `inventory_levels` dal client solo `min_threshold`; niente DELETE dal client su `sales`, `sale_lines`, `pos_events` | Idem. **Restano aperti:** INSERT diretti su `inventory_movements`/`finished_goods_movements`, `qty_posted` e `status` dei ricevimenti, ruolo `viewer` in RLS |
| altri | Aperti | — | F-04, F-06, F-08–F-17 invariati |

I guard della 058 si applicano **solo** alle scritture dirette del client (`current_user` = `authenticated`/`anon`).
Le RPC SECURITY DEFINER e il service role non passano dai guard: i write-path dell'app restano invariati
(verificato nel codice: revoca connessione = solo `status`/`revoked_at`; transizioni ordine = solo `status`;
`modules/inventory` aggiorna solo `min_threshold`; nessun `.delete()` su vendite/eventi). I nuovi codici
d'errore (P0204, P0310–P0312) sono mappati in italiano in `modules/marketplace/service.ts`.
`typecheck`, `test` (356/356) e `build` sono verdi.

---

## 1. Sintesi esecutiva

| ID | Titolo | Severità | Superficie | Sforzo fix |
|---|---|---|---|---|
| F-01 | Next.js 14.2.35 con 25 advisory, di cui 3 **RCE critiche** sull'Image Optimization API (`/_next/image` raggiungibile senza auth) | **Critical** (da advisory) | Runtime / tutte | S (mitigazione) · L (upgrade major) |
| F-02 | `scc_update`: il cliente **riattiva una connessione revocata** dal fornitore o la **ripunta** su un altro fornitore senza chiave | **High** | Marketplace / RLS | S |
| F-03 | `mo_update`: manomissione di colonne cross-tenant su `marketplace_orders` (`customer_org_id` / `supplier_org_id` / `connection_id`) | **High** | Marketplace / RLS | S |
| F-04 | `MIPOS_WEBHOOK_SECRET` globale + org risolta da `store_id` nel payload: con ≥2 tenant POS, ogni tenant può falsificare vendite e storni degli altri | **High** (condizionale) | Webhook POS | M |
| F-05 | Webhook POS intercettato dal middleware: le chiamate non autenticate vengono reindirizzate a `/login` (integrazione POS probabilmente non funzionante) | **Medium** (disponibilità) | Webhook POS | S |
| F-06 | Squatting di `store_id`: una org può rivendicare per prima lo store POS di un'altra e riceverne gli scontrini | **Medium** | POS | M |
| F-07 | Bypass degli invarianti del ledger via PostgREST: proiezioni scrivibili, movimenti forgiabili, vendite ed eventi POS cancellabili; ruolo `viewer` non applicato in RLS | **Medium** | DB / RLS | M |
| F-08 | Prezzi delle righe marketplace forgiabili bypassando `place_marketplace_order` | **Medium** | Marketplace | S |
| F-09 | Import ricette AI senza rate limit né tetto di chunk: abuso di costi | **Medium** | AI | S |
| F-10 | Open redirect post-login con `next=/\evil.com` | **Low** | Auth | S |
| F-11 | Header di sicurezza assenti (CSP, frame-ancestors, HSTS, Referrer-Policy) | **Low** | Tutte | S |
| F-12 | Riferimenti FK cross-tenant non validati negli insert (integrità, nessuna lettura) | **Low** | DB | M |
| F-13 | Upload dal portale: estensione e Content-Type decisi dal client (mitigato dalla whitelist MIME del bucket) | **Low** | Portale / Storage | S |
| F-14 | Token portale validi 1 anno, nel path, revocabili solo in blocco per fornitore | **Low** | Portale | S |
| F-15 | Chiavi `PSOS-…`: ~59 bit reali (il commento dice ~80) e riscatto senza rate limit | **Low** | Marketplace | S |
| F-16 | `017_marketplace_down.sql` (rollback distruttivo) è dentro il glob forward usato dalla CI | **Low / processo** | CI / DB | S |
| F-17 | Dipendenze vulnerabili: `zod` <4.6.6 (DoS memoria), `postcss`, `nanoid`, `source-map-js` | **Low–Medium** | Dipendenze | M |

**Cosa regge bene (verificato):** RLS abilitata su **tutte le 40 tabelle**; tutte le viste `v_*` sono
`security_invoker = on`; tutte le funzioni SECURITY DEFINER hanno `search_path` fissato e grant corretti
(le `_system` non sono eseguibili da `authenticated`/`anon`); JWT del portale verificato sempre in HMAC
(niente `alg` dall'header, revoca tramite `portal_token_version`, filtri org espliciti su ogni query
service-role); firma del webhook HMAC-SHA256 sul body grezzo con `timingSafeEqual`; client service role
`server-only`; bucket documenti privato con whitelist MIME e policy per cartella org; nessun segreto nella
storia git; nessun sink XSS (`dangerouslySetInnerHTML` solo su uno script statico); nessuna filter
injection PostgREST.

---

## 2. Finding

### F-01 · Next.js 14.2.35 vulnerabile (Critical da advisory)

**Evidenza.** `npm ls next` → `next@14.2.35`. `npm audit --omit=dev` → 1 critical e 4 high a livello di
pacchetto. Per `next`: 25 advisory, tra cui
GHSA-2xp9-vwfh-vxw4 (*Unauthenticated RCE in Image Optimization API when AVIF files are used*, `<15.5.24`),
GHSA-2464-fhr4-w9xw (*… when SVG files are used*, `<=15.5.27`),
GHSA-p293-qw3h-jr36 (RCE su host Windows, non applicabile a Railway/Linux),
GHSA-m99w-x7hq-7vfj e GHSA-p3m5-59mp-jv5r (DoS via Server Actions),
GHSA-q4gf-8mx6-v5v3 e GHSA-8h8q-6873-q5fj (DoS Server Components),
GHSA-955p-x3mx-jcvp (disclosure degli endpoint Server Function).

**Esposizione nel progetto.**
- `next.config.mjs` configura `images.formats: ['image/avif','image/webp']`.
- L'endpoint `/_next/image` è attivo per default anche senza `next/image` nel codice ed è **escluso
  dal middleware** (matcher `(?!…_next/image…)`), quindi raggiungibile senza autenticazione.
- In `public/` c'è `icon.svg`.

**Impatto.** Potenziale esecuzione di codice sul server Railway, con accesso a `SUPABASE_SERVICE_ROLE_KEY`,
cioè a **tutti i tenant**. Sfruttabilità **N.D.** (non riprodotta): la classifica viene dall'advisory.

**PoC (verifica esposizione, locale).**
```bash
npm run build && npm start &
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/_next/image?url=%2Ficon.svg&w=64&q=75'
```

**Rimedio.**
1. **Subito:** in `next.config.mjs` aggiungere `images: { unoptimized: true }` (il progetto non usa
   `next/image`): l'optimizer viene spento.
2. **Pianificato:** upgrade a `next@15.5.28+` (o 16.x) in un branch dedicato. È una major: Server Actions,
   `params` asincroni, `cookies()` asincrono. Rieseguire typecheck, test, build ed e2e e risincronizzare
   `package-lock.json`.

---

### F-02 · Riattivazione e ripuntamento delle connessioni marketplace (High)

**Evidenza.** `supabase/migrations_v2/016_marketplace_rls.sql:42`
```sql
create policy scc_update on public.supplier_customer_connections for update
  using      (customer_org_id = current_organization_id() or supplier_org_id = current_organization_id())
  with check (customer_org_id = current_organization_id() or supplier_org_id = current_organization_id());
```
Non esistono grant a livello di colonna (nessun `grant update (...)` in tutta la catena) e nessun
trigger su `supplier_customer_connections` blocca le colonne. Le policy che dipendono dalla connessione
(`sci_select`, `mo_insert`, `organizations_select_connected`) si fidano di `status` e di `supplier_org_id`.

**Attacchi.**
- **(a) Bypass della revoca.** Il fornitore S revoca il cliente C (`status='revoked'`). C esegue
  `UPDATE … SET status='active'` e torna a vedere il catalogo e i prezzi di S e a poter ordinare.
- **(b) Collegamento senza chiave.** C cambia `supplier_org_id` della propria connessione con l'UUID di
  un fornitore V. Ottiene il catalogo e il listino di V, i suoi dati org (`organizations_select_connected`)
  e la possibilità di mandargli ordini. Precondizione: conoscere l'UUID di V.
- **(c) Lato fornitore.** S cambia `customer_org_id` e legge la riga `organizations` (incluso il profilo
  fiscale, migration 038) di qualunque cliente di cui conosca l'UUID.

**PoC (psql su Supabase locale; `<C_USER>` = utente del cliente C).**
```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<C_USER>","role":"authenticated"}';
-- (a) la connessione è stata revocata dal fornitore
update supplier_customer_connections set status = 'active', revoked_at = null
 where customer_org_id = current_organization_id() and supplier_org_id = '<S_ORG>';
select count(*) from supplier_catalog_items where supplier_org_id = '<S_ORG>';  -- > 0 ⇒ FINDING
rollback;
```

**Rimedio (nuova migration `058_connection_column_guard.sql`).**
- Togliere `scc_update` e consentire le transizioni **solo** tramite RPC SECURITY DEFINER dedicate
  (`revoke_connection`, già implicito nel flusso UI).
- In alternativa: un trigger BEFORE UPDATE che renda immutabili `supplier_org_id`, `customer_org_id` e
  `connection_key_id` e che permetta `revoked → active` **solo** al fornitore (oppure solo tramite
  `connect_supplier_by_key_hash` con una chiave valida).
- Aggiungere un test di negazione in `supabase/tests/marketplace_rls.test.sql`.

---

### F-03 · Manomissione cross-tenant di `marketplace_orders` (High)

**Evidenza.** `016_marketplace_rls.sql:97`: `mo_update` usa USING/WITH CHECK del tipo
`customer_org_id = me OR supplier_org_id = me`. Il trigger `fn_marketplace_order_status_guard`
(`014:112`) fa **return early se lo status non cambia** e comunque non controlla le altre colonne.
`mo_insert` verifica la connessione solo all'INSERT.

**Attacchi.**
- **Fornitore → cliente arbitrario.** S fa `UPDATE … SET customer_org_id = '<VICTIM>'` (S resta
  `supplier_org_id`, quindi il WITH CHECK passa). L'ordine compare nel workspace della vittima e, se è
  `delivered`, può essere "registrato a magazzino" (`receive_marketplace_order`), iniettando stock e
  prezzi nel ledger della vittima. È una scrittura cross-tenant.
- **Cliente → fornitore arbitrario.** C cambia `supplier_org_id` e `connection_id` di un proprio
  ordine verso un fornitore non collegato: aggira il controllo di connessione di `mo_insert`
  e fa spam nella coda di V.
- **Timestamp di ciclo vita** (`delivered_at`, `accepted_at`…) riscrivibili liberamente, quindi audit
  inaffidabile.

**PoC.**
```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<S_USER>","role":"authenticated"}';
update marketplace_orders set customer_org_id = '<VICTIM_ORG>' where id = '<ORDER_OF_S>';
-- UPDATE 1 ⇒ FINDING
rollback;
```

**Rimedio.** Trigger BEFORE UPDATE `fn_marketplace_order_immutable_cols` che sollevi un'eccezione se
cambiano `customer_org_id`, `supplier_org_id`, `connection_id`, `idempotency_key`, `created_by` o i
timestamp `*_at` (questi ultimi li scrive solo il guard). Test di negazione in CI.

---

### F-04 · Secret webhook globale: falsificazione cross-tenant (High, condizionale)

**Evidenza.** `modules/pos/adapters/mipos.ts:76` legge un solo `MIPOS_WEBHOOK_SECRET`.
`app/api/webhooks/[provider]/route.ts` risolve l'org con `posRepo.resolveOrgId(admin, provider,
incoming.store_id, …)`: lo `store_id` arriva **dal payload firmato** e la scrittura avviene con il
service role (`ingest_sale_system(p_org, …)`).

**Impatto.** Per firmare, ogni cassa MiPOS deve conoscere il secret. Con il secondo cliente POS il
secret è condiviso, quindi il tenant B può inviare scontrini e void/refund firmati con lo `store_id`
di A: vendite fantasma, scarico dei finiti, storni indebiti nel ledger di A. Oggi c'è un solo tenant
(debito noto, VOL-8 §8.2), quindi la vulnerabilità è **latente**.

**PoC.**
```bash
BODY='{"type":"sale","receipt":{"id":"X1","store_id":"<STORE_DI_A>","items":[{"sku":"CANN","quantity":50}]}}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$MIPOS_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -s -X POST http://localhost:3000/api/webhooks/mipos -H "x-mipos-signature: sha256=$SIG" \
  -H 'content-type: application/json' --data "$BODY"
```

**Rimedio.** Secret per org in `pos_configs` (cifrato, ad esempio tramite Vault): risolvere prima la config
da `store_id` e poi verificare l'HMAC con **quel** secret. Va fatto **prima** di attivare il secondo
cliente POS.

---

### F-05 · Webhook POS intercettato dal middleware (Medium, disponibilità)

**Evidenza.** Il matcher di `middleware.ts` include `/api/webhooks/mipos` (verificato valutando la regex:
`true`). La richiesta della cassa non ha sessione, `/api/webhooks` non è in `PUBLIC_ROUTES`, quindi il
middleware risponde con `NextResponse.redirect('/login?next=/api/webhooks/mipos')` **prima** che il
route handler venga eseguito.

**Impatto.** Gli scontrini reali non arrivano mai a `pos_events`: la cassa riceve un 307 verso una
pagina HTML. È coerente con lo stato "0 eventi reali" documentato. I test unitari chiamano l'handler
direttamente e non passano dal middleware, per questo il problema non è emerso. Lato sicurezza è
fail-closed, ma blocca la funzione.

**PoC.**
```bash
curl -si -X POST http://localhost:3000/api/webhooks/mipos -d '{}' | head -3   # atteso 307 Location: /login…
```

**Rimedio.** Escludere `api/webhooks/` dal matcher (come già si fa per `portal/`) oppure fare
early-return nel middleware. L'handler ha già una propria autenticazione (HMAC).

---

### F-06 · Squatting di `store_id` (Medium)

**Evidenza.** `modules/pos/service.ts` (`savePosConfig`): `store_id` e `merchant_code` sono
self-service, unici a livello globale (UNIQUE provider+store_id) e **senza alcuna prova di possesso**.
In caso di collisione il messaggio "risulta già collegato a un'altra organizzazione" fa da oracolo di
enumerazione.

**Impatto.** Un'org registra per prima lo `store_id` di un concorrente (se prevedibile). Gli scontrini
firmati della vittima vengono attribuiti all'attaccante, che legge prodotti, quantità e incassi; la
vittima non riesce a configurare la propria cassa.

**Rimedio.** Verifica di possesso: lo store resta `pending` finché non arriva uno scontrino di prova
con un nonce generato da BakeryOS, oppure si lega lo store al secret per-org di F-04. Messaggio d'errore
generico.

---

### F-07 · Bypass degli invarianti del ledger via PostgREST (Medium)

**Evidenza (policy in vigore).**
| Policy | Migration | Effetto |
|---|---|---|
| `inventory_levels_update` | 009:266 | Qualunque membro fa `UPDATE inventory_levels SET current_quantity=…`. **Contraddice** `AGENTS.md` ("l'app non ha policy di UPDATE sulle proiezioni") |
| `inventory_movements_insert` / `fgm_insert` | 009:244 / 050:97 | Movimenti arbitrari (tipo, segno, reference) senza passare dalle RPC |
| `sales_write`, `sale_lines_write`, `pos_events_write` (`FOR ALL`) | 042/044 | DELETE di vendite ed eventi POS: la storia non è più append-only |
| `purchase_receipt_lines_update`, `purchase_receipts_update` | 035 | Si può riscrivere `qty_posted` o lo `status` di un ricevimento e ricontabilizzarlo (doppio carico) |
| `audit_logs` insert | 016 | Audit forgiabile dal tenant |

Il ruolo `viewer` (enum `org_role`) è controllato **solo** in alcuni service (inventory, pos, sales,
production template), mai in RLS: un viewer può creare ordini, ricevimenti, ricette e documenti
chiamando direttamente PostgREST o le Server Action.

**Impatto.** È intra-tenant (nessuna fuga di dati), ma un dipendente con qualunque ruolo può falsificare
il magazzino e cancellare le tracce. La riconciliazione notturna rileva il drift delle proiezioni, ma
non movimenti forgiati né cancellazioni.

**PoC.**
```sql
begin; set local role authenticated;
set local request.jwt.claims to '{"sub":"<VIEWER_USER>","role":"authenticated"}';
update inventory_levels set current_quantity = 999999 where organization_id = current_organization_id();
delete from sales where organization_id = current_organization_id();
rollback;
```

**Rimedio (migration).**
- `drop policy inventory_levels_update`.
- Sostituire le policy `FOR ALL` di `sales`, `sale_lines` e `pos_events` con SELECT soltanto: le
  scritture passano già dalle RPC definer.
- Su `inventory_movements` / `finished_goods_movements` consentire INSERT diretto solo per i tipi
  manuali (`manual_adjustment`, `waste`), con un ruolo diverso da `viewer`.
- Trigger che renda immutabile `qty_posted` fuori da `complete_purchase_receipt`.
- Helper `current_org_role()` da usare nelle policy di scrittura.

---

### F-08 · Prezzi forgiati nelle righe marketplace (Medium)

**Evidenza.** `place_marketplace_order` (051) fa lo snapshot di `unit_price_snapshot` dal catalogo, ma
`mo_insert` (cliente, `draft`) e `mol_write` (cliente, ordine in `draft`) permettono lo stesso flusso
**senza RPC**: si inseriscono la testata e le righe con `unit_price_snapshot`, `name_snapshot` e
`catalog_item_id` arbitrari, poi `UPDATE status='submitted'` (transizione lecita per il cliente).

**Impatto.** Il fornitore riceve un ordine con prezzi e descrizioni che non corrispondono al suo listino;
la pasticceria, alla ricezione, aggiorna la propria cache prezzi con valori falsi.

**Rimedio.** Revocare INSERT e UPDATE diretti (`mol_write`, `mo_insert`) e lasciare come unico write-path
la RPC 051. In alternativa: un trigger BEFORE INSERT su `marketplace_order_lines` che ricalcoli i
snapshot dal catalogo.

---

### F-09 · Abuso di costi sull'import ricette AI (Medium)

**Evidenza.** `modules/recipe-import/service.ts:55` richiede solo `requireOrgId()`, quindi qualunque
utente con org (incluso un fornitore o un viewer). Non ci sono rate limit, tetto sul numero di ricette o
budget per org. L'enrichment divide in chunk da 6 con concorrenza 4 (`ai/chunk.ts`). Il body delle Server
Action ha come unico limite il default di Next (~1 MB), cioè migliaia di righe e decine o centinaia di
chiamate LLM per richiesta, ripetibili all'infinito.

**Rimedio.** Consentire l'azione solo a customer non-viewer, con tetto di N ricette per analisi,
contatore giornaliero per org (tabella con quota) e timeout o abort. È positivo che l'output AI venga già
rivalidato con Zod (`importRecipesSchema`) prima del commit (AI-02 = OK).

---

### F-10 · Open redirect post-login (Low)

**Evidenza.** In `modules/identity/actions.ts:64` e in `app/(auth)/login/page.tsx:11` il controllo è
`next.startsWith('/') && !next.startsWith('//')`. Il valore `/\evil.com` lo supera e i browser
normalizzano `\` in `/`, quindi `Location: /\evil.com` diventa `//evil.com`.

**PoC.** `http://localhost:3000/login?next=/%5Cevil.example` → login → redirect esterno.

**Rimedio.** Normalizzare con `new URL(next, 'http://x')` e accettare solo se `origin === 'http://x'`,
oppure rifiutare `\` e i caratteri di controllo.

---

### F-11 · Header di sicurezza assenti (Low)

`next.config.mjs` imposta solo `Cache-Control` e `X-Robots-Tag` (sul portale). Mancano CSP,
`frame-ancestors`/`X-Frame-Options` (rischio di clickjacking sulle azioni con conferma, per esempio
"Completa produzione"), HSTS, `Referrer-Policy` (importante sul portale, che ha il token nel path),
`Permissions-Policy` (la camera serve allo scanner: va permessa solo a `self`).

---

### F-12 · Riferimenti FK cross-tenant non validati (Low)

Le policy INSERT controllano solo l'org del record padre: `recipe_ingredients.ingredient_id`,
`inventory_movements.ingredient_id`, `purchase_orders.supplier_id` (RPC `create_purchase_order`, che
verifica `p_organization_id` ma non `p_supplier_id`) e simili possono puntare a righe di un altro tenant.
Le letture restano protette (le viste sono invoker con RLS), ma l'integrità è debole. Rimedio: FK
composite `(organization_id, id)` o check nelle RPC.

---

### F-13 · Upload dal portale (Low)

`modules/portal/service.ts:276-281`: l'estensione viene presa dal nome del file senza whitelist e il
Content-Type da `file.type` (deciso dal client). Il bucket (031) impone
`allowed_mime_types = pdf/jpeg/png/webp` e 10 MB, e i path sono confinati nella cartella org: il rischio
residuo è basso. Da allineare a `lib/storage.ts` (che invece filtra). Nota funzionale: con il body limit
di default delle Server Action (1 MB) il limite di 10 MB non è raggiungibile.

### F-14 · Token del portale (Low)

HS256 corretto, ma `exp` = 1 anno, token nel path (cronologia, log del proxy, inoltro dell'email). La
revoca avviene solo in blocco per fornitore (`portal_token_version`). Consigliati: scadenza 30–90 giorni
con rinnovo, `Referrer-Policy: no-referrer` sul portale, rate limit.

### F-15 · Chiavi di connessione (Low)

`modules/marketplace/keys.ts`: 12 caratteri su un alfabeto di 30 danno ~59 bit (non ~80 come dice il
commento), con un lieve bias del modulo (`byte % 30`). Nessun rate limit sul riscatto. Online resta non
brute-forzabile; correggere il commento e aggiungere un rate limit per org e IP.

### F-16 · Rollback distruttivo dentro la catena forward (Low / processo)

`.github/workflows/ci.yml` applica `supabase/migrations_v2/[0-9]*.sql`, che include
`017_marketplace_down.sql`: questo **droppa** le tabelle marketplace, mentre la 022 e le successive le
referenziano. La catena "da zero" quindi non dovrebbe applicarsi: lo stato reale della CI è **N.D.**
(`gh` non autenticato). Rischio: chiunque applichi il glob su un DB reale cancella il marketplace.
Spostare il file in `supabase/rollback/`.

### F-17 · Altre dipendenze (Low–Medium)

`npm audit --omit=dev`: `zod <4.6.6` (DoS di memoria su collezioni enormi: ogni Server Action fa
`.parse()` su input utente), `postcss` / `source-map-js` / `nanoid` (transitive, soprattutto build-time).
Si risolvono in gran parte con l'upgrade di Next (F-01); `zod` va portato a 3.x patch o a 4.x separatamente.

---

## 3. Superficie → guardia attesa → guardia reale → verdetto

| Superficie | Guardia attesa | Guardia reale | Verdetto |
|---|---|---|---|
| `app/(main)/*` | middleware + `requireCustomerSession` + RLS | Presenti. Le Server Action sono invocabili da qualunque path per ID: la protezione è nei service (`requireOrgId`/`requireSession`) + RLS | OK (ruoli: vedi F-07) |
| `app/supplier/*` | middleware + `requireSupplierSession` + RLS | Presenti. Le scritture fornitore sono protette in RLS da `current_account_type()='supplier'` | OK |
| `app/portal/[token]/*` | JWT + versione + filtri org | Presenti su ogni query service-role | OK (F-13, F-14 minori) |
| `app/api/webhooks/[provider]` | HMAC per tenant | HMAC globale; il middleware lo blocca prima | F-04, F-05 |
| `app/api/pos/*` (4 route) | sessione + ruolo | `requireSession` / `requirePosWriter` nei service | OK |
| Auth / onboarding | redirect sicuri | `safeNext` aggirabile con `/\` | F-10 |
| PostgREST diretto (anon key) | solo RPC e policy | RLS su tutte le tabelle; policy permissive su marketplace e ledger | F-02, F-03, F-07, F-08 |

---

## 4. Matrice di copertura

Legenda: **OK** = verificato staticamente, nessun problema · **FINDING** = vedi §2 ·
**N.D.** = richiede esecuzione dinamica non disponibile in questo audit.

| ID | Esito | Note / evidenza |
|---|---|---|
| RLS-01 | FINDING | RLS enabled su 40/40 tabelle; nessuna policy `true`; nessun `FORCE RLS` (irrilevante: le tabelle sono di `postgres` e l'app non le usa da owner). Policy permissive: F-02, F-03, F-07 |
| RLS-02 | OK | Le UPDATE senza WITH CHECK (es. `purchase_receipt_lines_update`) ereditano USING come check (semantica Postgres); nessuno spostamento cross-org tramite `organization_id` |
| RLS-03 | OK | Tutte le viste `v_*` (ultima definizione di ciascuna) sono `security_invoker = on` (020/021/022/027/028/029/046/049/056) |
| RLS-04 | OK (d: FINDING F-12) | 23 funzioni definer: `search_path` fissato 23/23; grant revocati a `anon`/`public`; `_system` e reconciliation revocati anche ad `authenticated`; org-check presente sulle RPC esposte |
| RLS-05 | OK / N.D. | `current_organization_id()` = membership più vecchia (deterministica). 0 membership ⇒ NULL ⇒ nessuna riga. La membership in un'altra org richiede `org_members_insert` (owner di quell'org): non manipolabile. Il middleware usa `.limit(1)` **senza ORDER BY** (incoerente in multi-org) |
| RLS-06 | N.D. | PoC SQL pronti in F-02/F-03/F-07/F-08 |
| RLS-07 | OK (statico) / N.D. | Con anon key `current_organization_id()` è NULL ⇒ nessuna riga; le RPC esposte sono revocate ad `anon` |
| RLS-08 | OK | Unico `.or()` con interpolazione (`marketplace/service.ts:305,347`) usa `myOrg` ricavato dal server |
| RLS-09 | N.D. | `database.types.ts` precede la 057, che però non aggiunge colonne (solo una funzione) ⇒ drift atteso nullo |
| WH-01 | OK | HMAC sul body grezzo (`req.text()`), prefisso `sha256=` opzionale, `timingSafeEqual` |
| WH-02 | OK (statico) | UNIQUE `pos_events` (org, provider, store, receipt, event_type) + `ON CONFLICT` in `ingest_sale_system` |
| WH-03 | FINDING | F-04 / F-06 |
| WH-04 | OK | `getPosAdapter` sconosciuto ⇒ 404 JSON pulito (ma il middleware prima risponde 307, F-05) |
| WH-05 | OK | `quantity > 0` CHECK in `sale_lines` (042:70); `recipe_id` risolto dalle mappature dell'org; void sullo stesso receipt ⇒ storno solo se la vendita esiste |
| WH-06 | FINDING | L'org deriva dallo `store_id` nel payload firmato ⇒ F-04 |
| WH-07 | N.D. | Nessun rate limit applicativo; l'idempotenza limita l'amplificazione |
| WH-08 | FINDING | F-04 |
| PT-01 | OK | `alg` ignorato (sempre HMAC-SHA256 via WebCrypto), `exp` obbligatorio, scope e versione verificati a ogni richiesta |
| PT-02 | OK | Ogni query filtra `organization_id` + `supplier_id` del token |
| PT-03 | OK / N.D. | Secret ≥32 caratteri imposto; entropia del valore reale di prod N.D. |
| PT-04 | FINDING | F-14 |
| PT-05 | FINDING (Low) | F-13 |
| PT-06 | OK / N.D. | Token revocato/scaduto ⇒ eccezione ⇒ `/portal/expired`; rate limit assente (brute force HMAC impraticabile) |
| MK-01 | FINDING (Low) | F-15; confronto per hash in SQL (lookup su indice, il timing non è sfruttabile) |
| MK-02 | FINDING | F-08 (prezzi), F-03; `idempotency_key` UNIQUE per `(customer_org_id, key)` ⇒ nessuna collisione cross-org |
| MK-03 | N.D. | PO specchio UNIQUE `marketplace_order_id` (race-safe per costruzione): la concorrenza va provata a runtime |
| MK-04 | OK (statico) | Guard P0200–P0203 sulle transizioni; **però** le colonne non di stato sono libere (F-03) |
| MK-05 | OK / FINDING | Fornitore non vede le bozze (052). `organizations_select_connected` vale anche per connessioni revocate (voluto, per lo storico), combinato con F-02c |
| SA-01 | OK | Le guardie stanno nei service; le actions del fornitore sono protette dalla RLS `account_type` |
| SA-02 | OK | Layout `(main)` e `supplier` con guard fail-closed |
| SA-03 | OK / FINDING | Client RLS ⇒ gli ID di altre org non sono visibili; FK cross-tenant su insert: F-12 |
| SA-04 | OK (campione) | Zod `.parse()` nei service campionati (catalog, recipe-import, marketplace, pos) |
| SA-05 | N.D. | Next 14 verifica Origin vs Host sulle Server Action; flag dei cookie `@supabase/ssr` da verificare a runtime |
| SA-06 | FINDING (Low) / N.D. | F-10; enumerazione email e policy password dipendono dalla config di Supabase Auth (N.D.) |
| SA-07 | OK | L'org supplier si crea a signup (voluto); senza chiave non vede nulla dei clienti (salvo F-02/F-03) |
| SA-08 | N.D. | Dipende da Supabase Auth |
| SR-01 | OK / N.D. | `lib/supabase/admin.ts` è `server-only`; il grep sul bundle `.next` va rifatto dopo la build |
| SR-02 | OK | Webhook (org dalla config), portale (filtri espliciti); recipe-import **non** usa il service role (solo citato in un commento) |
| SR-03 | OK | Solo `.env.example` tracciato (placeholder); nessun JWT o chiave AI nella storia (pattern grep su tutte le rev) |
| DOC-01 | OK / FINDING Low | Bucket privato, whitelist MIME, 10 MB, cartella `org_id`; signed URL di 1 h; portale F-13 |
| DOC-02 | N.D. | `pdf-parse@1.1.4` (non più mantenuto) su input ostile: DoS da provare; attutito dal limite di 1 MB delle Server Action |
| DOC-03 | OK (statico) | Matching sotto RLS dell'org |
| EM-01 | OK | `ORDER_DISPATCH_WEBHOOK_URL` è solo env, non configurabile dall'utente ⇒ nessuna SSRF utente |
| EM-02 | N.D. | Il payload verso il webhook di dispatch è JSON; header/CRLF dipendono dal servizio a valle |
| EM-03 | FINDING (Low) | Token nel link email: F-14 |
| AI-01 | OK (mitigato) | Prompt injection possibile, ma l'output viene rivalidato da Zod e passato a `createRecipe`/`createIngredient`; il rendering React fa l'escape |
| AI-02 | OK | `importRecipesSchema.parse(raw)` prima del commit |
| AI-03 | FINDING | F-09 |
| AI-04 | OK | `GEMINI_BASE_URL` / `RECIPE_IMPORT_AI_MODEL` sono solo env |
| RA-01 | N.D. | Lock di riga in `complete_purchase_receipt`; ricompletamento del piano bloccato da `trg_plan_terminal_guard` + RPC. Concorrenza da provare |
| RA-02 | N.D. | CHECK `quantity > 0` presenti su vendite e ordini; edge case sulle viste da provare |
| RA-03 | FINDING | Nessun rate limit applicativo su login, signup, webhook, portale, upload, AI (F-09) |
| HD-01 | FINDING | F-11 |
| HD-02 | OK | Unico `dangerouslySetInnerHTML` statico (`app/layout.tsx:54`) |
| HD-03 | N.D. | `getErrorMessage` mostra i messaggi delle eccezioni (inclusi gli errori DB in alcuni path, es. `throw new Error(error.message)` nel portale) |
| HD-04 | OK / FINDING | 5 route API enumerate (§3); F-05 |
| HD-05 | FINDING | F-01, F-17 |
| HD-06 | N.D. | Debito noto (riconciliazione su `received_at`) |

---

## 5. Top 5 da fare subito

1. **`images: { unoptimized: true }`** in `next.config.mjs` (riduce F-01 in 1 riga) e pianificare l'upgrade
   di Next a ≥15.5.28.
2. **Migration 058:** trigger di immutabilità su `supplier_customer_connections` e `marketplace_orders`
   (F-02, F-03), più `drop policy inventory_levels_update` e niente DELETE su sales e pos_events (F-07).
3. **Escludere `/api/webhooks/` dal matcher del middleware** (F-05): senza questo il POS non funziona.
4. **Secret POS per org e verifica di possesso dello store** prima del secondo cliente POS (F-04, F-06).
5. **Rate limit e quota** sull'import AI e sugli endpoint pubblici (F-09, RA-03), e fix di `safeNext` (F-10).

Ogni fix SQL va accompagnato da un **test di negazione** in `supabase/tests/` (utente B / fornitore S /
viewer NON può …), da aggiungere al job `sql` della CI.

---

## 6. Prossimo passo: chiudere gli N.D.

```bash
# prerequisiti
open -a Docker
brew install supabase/tap/supabase libpq && brew link --force libpq
# DB locale + catena (escludendo il rollback 017, vedi F-16)
supabase start
for f in supabase/migrations_v2/[0-9]*.sql; do [[ $f == *017_* ]] && continue; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; done
```
Poi creare il seed (bakery A, bakery B, supplier S, viewer V) ed eseguire i PoC di §2 e le voci N.D.
