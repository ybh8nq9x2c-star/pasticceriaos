-- =============================================================================
-- 055_nightly_reconciliation.sql
-- Hardening P0 — riconciliazione notturna READ-ONLY sul dominio.
--
-- Ogni notte verifica gli invarianti che il resto del sistema dà per scontati:
--   1. drift ledger materie prime  (inventory_levels ≠ Σ inventory_movements)
--   2. drift ledger prodotti finiti (finished_goods_levels ≠ Σ movimenti)
--   3. anomalie unità (da diagnostics/unit_consistency.sql):
--      movimenti in unità ≠ unità del prodotto; livelli in unità ≠ prodotto
--   4. utenti multi-org (da diagnostics/multi_org_guard.sql) — finché l'org
--      attiva non vive nel JWT, deve restare 0
--
-- ONESTÀ OPERATIVA: ogni run viene registrata in reconciliation_runs (anche a
-- zero anomalie: è la prova che il controllo è girato, non teatro). Le
-- NOTIFICHE invece partono SOLO quando c'è un'anomalia, org per org, con
-- dedup giornaliera (stesso pattern della edge function expiry-alerts).
-- Nessuna scrittura sul dominio: le uniche insert sono log e notifiche.
-- =============================================================================

-- ── Log delle run (append-only, fuori dal dominio) ────────────────────────────
create table if not exists public.reconciliation_runs (
  id        uuid primary key default gen_random_uuid(),
  ran_at    timestamptz not null default now(),
  anomalies integer not null,
  findings  jsonb not null
);

comment on table public.reconciliation_runs is
  'Esiti della riconciliazione notturna (run_nightly_reconciliation). Append-only; anche le run a zero anomalie vengono registrate come prova di esecuzione.';

-- RLS attiva senza policy: leggibile solo da service_role/owner (è telemetria
-- di piattaforma, non dato di dominio per-org).
alter table public.reconciliation_runs enable row level security;

-- ── La funzione di riconciliazione ────────────────────────────────────────────
create or replace function public.run_nightly_reconciliation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_drift  jsonb;  -- org_id -> n prodotti in drift
  v_fg_drift   jsonb;
  v_mov_units  jsonb;  -- org_id -> n movimenti in unità ≠ prodotto
  v_lvl_units  jsonb;  -- org_id -> n livelli in unità ≠ prodotto
  v_multi_org  integer;
  v_findings   jsonb;
  v_total      integer;
  v_org        uuid;
  v_msg        text;
  v_today      timestamptz := date_trunc('day', now());
begin
  -- 1) Drift materie prime: proiezione ≠ somma del ledger.
  select coalesce(jsonb_object_agg(organization_id, n), '{}'::jsonb) into v_raw_drift
  from (
    select l.organization_id, count(*) as n
    from inventory_levels l
    join (
      select organization_id, ingredient_product_id, sum(quantity_delta) as s
      from inventory_movements group by 1, 2
    ) m on m.organization_id = l.organization_id
       and m.ingredient_product_id = l.ingredient_product_id
    where l.current_quantity <> m.s
    group by l.organization_id
  ) t;

  -- 2) Drift prodotti finiti.
  select coalesce(jsonb_object_agg(organization_id, n), '{}'::jsonb) into v_fg_drift
  from (
    select l.organization_id, count(*) as n
    from finished_goods_levels l
    join (
      select organization_id, recipe_id, sum(quantity_delta) as s
      from finished_goods_movements group by 1, 2
    ) m on m.organization_id = l.organization_id and m.recipe_id = l.recipe_id
    where l.current_quantity <> m.s
    group by l.organization_id
  ) t;

  -- 3a) Movimenti in unità diversa da quella canonica del prodotto
  --     (diagnostics/unit_consistency.sql, query 3: ogni riga è un delta
  --     potenzialmente sommato nell'unità sbagliata).
  select coalesce(jsonb_object_agg(organization_id, n), '{}'::jsonb) into v_mov_units
  from (
    select m.organization_id, count(*) as n
    from inventory_movements m
    join ingredient_products ip on ip.id = m.ingredient_product_id
    where m.unit <> ip.unit
    group by m.organization_id
  ) t;

  -- 3b) Livelli "congelati" in un'unità diversa dal prodotto (query 4).
  select coalesce(jsonb_object_agg(organization_id, n), '{}'::jsonb) into v_lvl_units
  from (
    select l.organization_id, count(*) as n
    from inventory_levels l
    join ingredient_products ip on ip.id = l.ingredient_product_id
    where l.unit <> ip.unit
    group by l.organization_id
  ) t;

  -- 4) Guardia multi-org (globale): deve restare 0 finché l'org non è nel JWT.
  select count(*) into v_multi_org
  from (select user_id from org_members group by user_id having count(*) > 1) u;

  v_findings := jsonb_build_object(
    'raw_ledger_drift',     v_raw_drift,
    'finished_goods_drift', v_fg_drift,
    'movement_unit_mismatch', v_mov_units,
    'level_unit_mismatch',  v_lvl_units,
    'multi_org_users',      v_multi_org
  );

  select coalesce(sum((v)::int), 0) + v_multi_org into v_total
  from (
    select value as v from jsonb_each_text(v_raw_drift)
    union all select value from jsonb_each_text(v_fg_drift)
    union all select value from jsonb_each_text(v_mov_units)
    union all select value from jsonb_each_text(v_lvl_units)
  ) all_counts;

  insert into reconciliation_runs (anomalies, findings) values (v_total, v_findings);

  -- Notifiche per-org SOLO se c'è qualcosa che non va (dedup giornaliera).
  for v_org in
    select distinct (k)::uuid from (
      select jsonb_object_keys(v_raw_drift) as k
      union select jsonb_object_keys(v_fg_drift)
      union select jsonb_object_keys(v_mov_units)
      union select jsonb_object_keys(v_lvl_units)
    ) keys
  loop
    if exists (
      select 1 from notifications
      where organization_id = v_org
        and title like 'Riconciliazione magazzino%'
        and created_at >= v_today
    ) then
      continue;
    end if;

    v_msg := concat_ws(E'\n',
      case when v_raw_drift ? v_org::text
        then 'Materie prime: ' || (v_raw_drift ->> v_org::text) || ' prodotti con giacenza diversa dalla somma dei movimenti.' end,
      case when v_fg_drift ? v_org::text
        then 'Prodotti finiti: ' || (v_fg_drift ->> v_org::text) || ' ricette con giacenza diversa dalla somma dei movimenti.' end,
      case when v_mov_units ? v_org::text
        then 'Unità: ' || (v_mov_units ->> v_org::text) || ' movimenti registrati in un''unità diversa da quella del prodotto.' end,
      case when v_lvl_units ? v_org::text
        then 'Unità: ' || (v_lvl_units ->> v_org::text) || ' giacenze in un''unità diversa da quella del prodotto.' end
    );

    insert into notifications (organization_id, type, title, message, href)
    values (
      v_org, 'warn',
      'Riconciliazione magazzino: anomalie rilevate',
      v_msg || E'\nVerifica i movimenti recenti o contatta il supporto.',
      '/inventory/movements'
    );
  end loop;

  return jsonb_build_object('anomalies', v_total, 'findings', v_findings);
end;
$$;

comment on function public.run_nightly_reconciliation() is
  'Riconciliazione notturna read-only: drift ledger raw/finiti, anomalie unità, guardia multi-org. Logga SEMPRE la run in reconciliation_runs; notifica le org SOLO su anomalie (dedup giornaliera). Estendibile aggiungendo check al jsonb findings.';

-- Solo il sistema la esegue (pg_cron gira come owner del job): nessun grant app.
revoke all on function public.run_nightly_reconciliation() from public, anon, authenticated;

-- ── Schedulazione notturna (02:30 UTC), idempotente come 034 ─────────────────
-- pg_cron potrebbe non essere ancora attiva (es. ambienti dove 034 non è nello
-- slice applicato, o catena-da-zero in CI): la migration è autosufficiente.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'nightly-reconciliation') then
    perform cron.unschedule('nightly-reconciliation');
  end if;
end$$;

select cron.schedule(
  'nightly-reconciliation',
  '30 2 * * *',
  $$select public.run_nightly_reconciliation()$$
);
