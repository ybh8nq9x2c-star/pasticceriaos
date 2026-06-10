# Marketplace — Production rollout runbook

> **STATO: NON ANCORA APPLICATO IN PRODUZIONE.**
> La mutazione del DB di produzione (`btxmjfjctrwlmonbnjpz`) è uno step
> **GO/NO-GO esplicito**. Nulla in questo runbook viene eseguito finché l'owner
> non dà un'istruzione esplicita separata. Documento solo per review.

Lo stesso set di migration è stato applicato e validato su un progetto staging
isolato: schema corretto (9 tabelle, RLS attiva, policy count attesi), test P0 di
tenant-isolation superato (due volte, prima e dopo `018`), tipi rigenerati,
`typecheck` + `build` + `vitest` verdi.

---

## 1. Scope e vincoli

- **Vincolo assoluto:** nessuna mutazione su produzione finché non arriva un
  **GO esplicito**. Le verifiche di questo runbook sono **tutte read-only**.
- **Ordine di rilascio obbligatorio:** **Set A → Set B → Set C.**
  - **Set A — migration DB:** `012–016` + `018` + `019` (questa cartella). `017` = rollback marketplace.
  - **Set B — codice (dipende da Set A):** marketplace (`modules/marketplace/*`,
    `app/supplier/*`, `app/(main)/marketplace/*`, gating account-type nel
    middleware, threading `accountType` in identity) **+ il refactor write-path
    operativo** (`modules/ordering/service.ts` e `modules/production/service.ts`
    ora chiamano le RPC transazionali `receive_purchase_order` /
    `complete_production_plan` di `019`) **+** `lib/database.types.ts`.
  - **Set C — front-end/mobile responsive** (dipende da Set B, solo
    presentational, **nessuna dipendenza DB**): `MobileChrome`, `navConfig`,
    `app/manifest.ts`, `public/icon.svg`, edit responsive, `globals.css`, viewport.
- **Mai** deployare codice che usa `organizations.account_type`,
  `current_account_type()`, `create_organization` 5-arg o le tabelle marketplace
  **prima** che Set A esista nel DB target.
- **Prerequisito (UNKNOWN — confermare in preflight):** questo runbook assume che
  lo schema operativo base (`migrations_v2/001–011`: inventory, production,
  ordering, viste, RLS, trigger, RPC) sia **già in produzione**. Va confermato
  con il preflight read-only §3 prima del GO.

---

## 2. Ordine esatto di applicazione

Applicare in avanti, in quest'ordine (ogni file è idempotente — `if not exists` /
`create or replace` / `drop … if exists`):

1. `012_marketplace_account_type.sql` — enum `account_type` + `organizations.account_type` (DEFAULT `'customer'`) + `current_account_type()` + `create_organization` 5-arg (droppa la 4-arg).
2. `013_marketplace_connections_catalog.sql` — `supplier_connection_keys`, `supplier_customer_connections`, `supplier_catalog_items`, `assert_org_is_supplier()`.
3. `014_marketplace_orders.sql` — `marketplace_orders` + lines + status history + trigger guard/log.
4. `015_marketplace_audit_and_rpc.sql` — `audit_logs` + `connect_supplier_by_key_hash()`.
5. `016_marketplace_rls.sql` — policy RLS + indici.
6. `018_marketplace_harden.sql` — `search_path` pinned sulle 2 funzioni segnalate; revoca EXECUTE RPC su funzioni interne/trigger; revoca PUBLIC/anon su `create_organization` + `connect_supplier_by_key_hash` (resta `authenticated`).
7. `019_ordering_production_txn.sql` — RPC transazionali del loop operativo P0: `receive_purchase_order(uuid)` (movimenti `purchase_receipt` + `quantity_received` + refresh prezzo + stato `received` + history, atomico) e `complete_production_plan(uuid)` (movimenti `production_usage` poi stato `completed`, atomico). **Additiva**: il codice live non le chiama finché Set B non è deployato.

`017_marketplace_down.sql` è il **rollback** marketplace — **non** applicarlo in avanti.
Rollback di `019`: `drop function if exists public.receive_purchase_order(uuid);` e
`drop function if exists public.complete_production_plan(uuid);` (in coda al file).

---

## 3. Preflight read-only

Tutte SELECT/introspezione: **nessuna scrittura**.

- [ ] **GO esplicito** dell'owner per questa finestra.
- [ ] Finestra a basso traffico; team avvisato; nessun altro deploy/migration in corso.
- [ ] Backup/PITR confermato (§4).
- [ ] **Prerequisiti base presenti** (deve tornare tutto valorizzato):

```sql
select
  to_regclass('public.organizations')                  as t_orgs,
  to_regclass('public.org_members')                    as t_members,
  to_regclass('public.inventory_movements')            as t_inv_mov,
  to_regclass('public.inventory_levels')               as t_inv_lvl,
  to_regprocedure('public.current_organization_id()')  as fn_current_org,
  to_regprocedure('public.set_updated_at()')           as fn_set_updated,
  to_regclass('public.v_ingredient_requirements')      as v_req,
  exists(select 1 from pg_type where typname='unit_of_measure') as enum_uom,
  exists(select 1 from pg_type where typname='movement_type')   as enum_mov,
  exists(select 1 from pg_trigger
         where tgname='trg_inventory_movement_after_insert')    as trg_inv_update;
```
- [ ] **Stato di partenza pulito:** `select exists(select 1 from pg_type where typname='account_type');` → atteso `false`.
- [ ] **Baseline advisor** (security + performance) catturata per attribuire i delta post-apply.
- [ ] **Artifact app** Set B+C buildati verdi (`typecheck`, `build`, `vitest`).

> Nota: la feature **non** richiede `pgcrypto` in prod (le chiavi sono hashate in
> Node). `digest()` serve solo alla fixture SQL del test, non alle migration.

---

## 4. Backup / restore

**Prima di applicare:**
- Confermare **PITR** attivo e annotare il timestamp UTC esatto **immediatamente
  prima** della prima migration.
- Snapshot logico opzionale (lo schema marketplace è vuoto all'apply → basta lo schema):
  ```bash
  pg_dump "$PROD_DB_URL" --schema=public --no-owner --format=custom \
    -f pre_marketplace_$(date -u +%Y%m%dT%H%M%SZ).dump
  ```

**Restore (worst case):**
- **Preferito:** **PITR restore** al timestamp pre-apply (copre dati + schema).
- Solo struttura senza PITR: `017_marketplace_down.sql` (vedi §7).

---

## 5. Apply plan

Per ogni file nell'ordine §2, con lo stesso meccanismo validato in staging
(`apply_migration` / SQL editor / CLI):

1. Applica il file.
2. Conferma successo (nessun errore).
3. Procedi al successivo **solo** se ok.

Stop immediato a qualsiasi errore. I file sono additivi: un file fallito lascia i
precedenti applicati (additivi e safe), ma non proseguire finché non è chiaro.

---

## 6. Post-apply verification (read-only + smoke)

**6a. Schema & RLS** (read-only; attesi 9 record, tutti `rls_enabled=true`; policy:
orders 3, keys 3, lines 2, catalog 2, connections 2, audit 2, history 1, orgs ≥1, members ≥1):

```sql
select c.relname, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.tablename=c.relname) as policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in (
  'organizations','org_members','supplier_connection_keys',
  'supplier_customer_connections','supplier_catalog_items','marketplace_orders',
  'marketplace_order_lines','marketplace_order_status_history','audit_logs')
order by c.relname;
```

**6b. Hardening funzioni** (read-only; trigger/interne solo `postgres`/`service_role`;
`create_organization` + `connect_supplier_by_key_hash` senza PUBLIC/anon):

```sql
select p.proname, coalesce(array_to_string(p.proacl,'; '),'(default)') as acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('fn_marketplace_order_status_guard','fn_marketplace_order_status_log',
  'assert_org_is_supplier','marketplace_order_actor_for_transition',
  'create_organization','connect_supplier_by_key_hash')
order by p.proname;
```

**6b-bis. RPC operative `019`** (read-only; attese `authenticated` + `service_role`, senza PUBLIC/anon):

```sql
select p.proname, p.prosecdef as security_definer,
       coalesce(array_to_string(p.proacl,'; '),'(default)') as acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('receive_purchase_order','complete_production_plan')
order by p.proname;
```

**6c. Advisor** — rieseguire i security advisor; attese solo le WARNING accettate su
`current_organization_id` / `current_account_type` / `is_org_owner` (helper RLS che
devono restare callable da `authenticated`; ritornano null/false ad anon, nessun
leak). Nessun nuovo ERROR.

**6d. Integrità app esistente** — `select count(*) from organizations where account_type='customer';`
deve uguagliare il conteggio org pre-apply (la colonna ha defaultato ogni org a `customer`).

**6e. Smoke test app** (dopo deploy Set B+C): onboarding customer + supplier;
supplier genera chiave → customer si collega → crea ordine; supplier vede l'ordine e
avanza lo stato → customer vede l'update; un secondo customer NON vede l'ordine del primo.

> Il test SQL completo (`supabase/tests/marketplace_rls.test.sql`) è transazionale e
> fa **rollback**, ma semina `auth.users` e richiede `pgcrypto`: in prod preferire lo
> smoke test app; il test SQL è già passato in staging ed è per uso non-prod.

---

## 7. Rollback

**Trigger di rollback:** una qualsiasi verifica §6 fallisce, advisor con nuovo
ERROR, o lo smoke test rivela un difetto di isolamento/autorizzazione.

- **Rollback strutturale (nessun dato cliente ancora):** eseguire
  `017_marketplace_down.sql`. Droppa gli oggetti marketplace in ordine FK-safe,
  droppa la `create_organization` 5-arg e **ripristina la 4-arg**, poi droppa
  `organizations.account_type` e l'enum **per ultimi**.
  - ⚠️ Safe solo finché nessuna riga dipende dai nuovi oggetti. Se esistono
    connection/ordini reali → preferire PITR.
- **Recovery completa (dati coinvolti):** **PITR restore** al timestamp §4.
- **Rollback codice:** revert del deploy Set B+C. Set A è additivo e defaultato
  (`account_type='customer'`), quindi il revert del solo codice lascia l'app
  customer esistente pienamente funzionante anche con le nuove tabelle presenti.

**Coordinamento:** mai lasciare codice Set B/C live contro un DB su cui Set A è
stato rollbackato → prima revert del codice, poi rollback DB.

---

## 8. Code deploy ordering

1. **Set A** (DB) applicato e verificato (§5–§6).
2. **Set B** (codice marketplace) deployato — dipende da Set A.
3. **Set C** (mobile/presentational) — può viaggiare con Set B o come PR front-end
   separata; nessuna dipendenza DB.

Env vars già presenti (nessuna nuova). Nessuna nuova variabile né migration per il
mobile.

---

## 9. Rischi noti e finestra apply-before-deploy

**Finestra apply-before-deploy (DB applicato, codice non ancora deployato).**
`012` droppa la `create_organization` 4-arg e crea la 5-arg con
`p_account_type DEFAULT 'customer'`. Il codice **attualmente live** chiama l'RPC con
4 arg nominali (`p_name, p_slug, p_city, p_email`); PostgREST li risolve comunque
sulla 5-arg (il param mancante è defaultato), quindi **l'onboarding continua a
funzionare** nella finestra tra apply Set A e deploy Set B. PostgREST ricarica lo
schema cache automaticamente dopo la DDL. → Finestra **safe**, ma va spiegata ai
reviewer e mantenuta breve.

**RISOLTI da `019` + refactor Set B (da validare in staging prima del GO):**
- **`ordering.changeOrderStatus(received)`** ora delega a `receive_purchase_order`
  (RPC transazionale): movimenti → `quantity_received` → refresh prezzo → stato →
  history, atomico. Idempotente (richiede `status='confirmed'`). Niente più ordine
  inverso né scritture parziali.
- **`production.completePlan`** ora delega a `complete_production_plan` (RPC
  transazionale): movimenti `production_usage` poi stato `completed`, atomico.
  Idempotente (richiede `status≠completed`).
- *Bonus:* eliminato l'accoppiamento `ordering`/`production` → `inventory/repository`
  (le RPC sostituiscono `insertMovement`).

**RESIDUO — hardening difesa in profondità (NON bloccante, decisione owner):**
- **`inventory_levels.current_quantity` scrivibile via API:** la policy
  `inventory_levels_update` non limita le colonne → un membro `authenticated`
  potrebbe in teoria scrivere `current_quantity`. L'app **non** lo fa (verificato),
  e l'architettura prevede quel campo come **proiezione** aggiornata solo dal
  trigger su `inventory_movements`. *Fix consigliato (migration separata):*
  `REVOKE UPDATE (current_quantity) ON inventory_levels FROM authenticated;`
  lasciando aggiornabile solo `min_threshold`. Non incluso in `019` per tenerlo
  focalizzato sul contratto transazionale.

**Rischi rollout DB:** vedi §7. Mai lasciare Set B/C contro un DB rollbackato.
