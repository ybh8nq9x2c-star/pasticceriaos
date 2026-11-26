-- =============================================================================
-- 060_production_fefo_lots.sql  (W3 — REMEDIATION_REPORT.md)
-- complete_production_plan v5: consumo dei LOTTI in produzione + esito dichiarato.
--
-- Problema (definizione finale della 050):
--   * scaricava la giacenza aggregata ma NON decrementava ingredient_batches
--     (la 040 allocava i lotti FEFO; 043/050 hanno perso quel pezzo): i residui
--     dei lotti restavano pieni → FEFO, scadenze e tracciabilità HACCP falsi;
--   * le righe ricetta con unità non convertibile venivano escluse con un
--     `where … is not null` SILENZIOSO, e il finito veniva comunque accreditato.
--
-- v5 (stessa transazione, stesse garanzie v4: atomica, non ricompletabile):
--   1) fabbisogno per INGREDIENTE nell'unità di magazzino (conversione 021);
--   2) per ogni ingrediente: lock della giacenza, UN movimento production_usage
--      (qty_before/after), poi allocazione FEFO sui lotti attivi
--      (expiry_date, received_at) sotto lock: residuo decrementato, riga in
--      production_batch_ingredients collegata al MOVIMENTO (nuova colonna);
--      la parte non coperta da lotti è dichiarata (stock senza lotto, es. carico
--      iniziale), non inventata;
--   3) righe con unità incompatibile: SALTATE e DICHIARATE (nessun movimento,
--      lotti non toccati). Il finito della ricetta viene accreditato (la
--      produzione è avvenuta) ma marcato `ingredients_complete=false` nell'esito
--      e nelle note del movimento: mai un fallback silenzioso;
--   4) esito jsonb restituito E salvato in production_plans.completion_report
--      (nuova colonna) → visibile nel dettaglio piano.
-- Il tipo di ritorno cambia (void → jsonb): serve DROP + CREATE, con i grant
-- ripristinati identici (revoke public/anon, grant authenticated).
-- =============================================================================

alter table production_plans
  add column if not exists completion_report jsonb;
comment on column production_plans.completion_report is
  'Esito dichiarato del completamento (060): consumi per ingrediente con lotti FEFO, quota senza lotto, righe saltate per unità incompatibile, accrediti finiti.';

alter table production_batch_ingredients
  add column if not exists inventory_movement_id uuid references inventory_movements(id);
comment on column production_batch_ingredients.inventory_movement_id is
  'Movimento production_usage da cui deriva il consumo del lotto (060).';

drop function if exists public.complete_production_plan(uuid);

create function public.complete_production_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_status   plan_status;
  v_user     uuid := auth.uid();
  v_req      record;
  v_batch    record;
  v_before   numeric(12,4);
  v_mov      uuid;
  v_need     numeric;      -- fabbisogno residuo, unità di magazzino
  v_bfactor  numeric;      -- unità magazzino → unità lotto
  v_take     numeric;      -- quantità presa dal lotto, unità lotto
  v_lots     jsonb;
  v_consumed jsonb := '[]'::jsonb;
  v_skipped  jsonb;
  v_output   jsonb;
  v_report   jsonb;
begin
  if v_user is null then
    raise exception 'complete_production_plan: utente non autenticato' using errcode = 'P0001';
  end if;

  select organization_id, status into v_org, v_status
  from production_plans where id = p_plan_id
  for update;

  if v_org is null then
    raise exception 'complete_production_plan: piano non trovato' using errcode = 'P0044';
  end if;
  if v_org is distinct from current_organization_id() then
    raise exception 'complete_production_plan: piano di un''altra organizzazione' using errcode = 'P0043';
  end if;
  if v_status = 'completed' then
    raise exception 'complete_production_plan: piano già completato' using errcode = 'P0040';
  end if;
  if v_status = 'cancelled' then
    raise exception 'complete_production_plan: piano cancellato' using errcode = 'P0040';
  end if;

  -- ── Righe NON scaricabili (unità incompatibile / ingrediente di altra org):
  --    saltate e dichiarate, mai filtrate in silenzio ─────────────────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'recipe_id', r.id, 'recipe_name', r.name,
           'ingredient_product_id', ip.id, 'ingredient_name', ip.name,
           'quantity', ri.quantity * ppi.batch_count,
           'recipe_unit', ri.unit, 'stock_unit', ip.unit,
           'reason', case when ip.organization_id is distinct from v_org
                          then 'ingredient_other_org' else 'unit_incompatible' end
         ) order by r.name, ip.name), '[]'::jsonb)
    into v_skipped
  from production_plan_items ppi
  join recipes             r  on r.id  = ppi.recipe_id
  join recipe_ingredients  ri on ri.recipe_id = ppi.recipe_id
  join ingredient_products ip on ip.id = ri.ingredient_product_id
  where ppi.production_plan_id = p_plan_id
    and (unit_conversion_factor(ri.unit, ip.unit) is null
         or ip.organization_id is distinct from v_org);   -- F-12: mai scaricare stock altrui

  -- ── Materie prime: un movimento per ingrediente + consumo FEFO dei lotti ────
  for v_req in
    select ip.id as ingredient_product_id, ip.name, ip.unit,
           sum(ri.quantity * ppi.batch_count * unit_conversion_factor(ri.unit, ip.unit)) as qty
    from production_plan_items ppi
    join recipe_ingredients  ri on ri.recipe_id = ppi.recipe_id
    join ingredient_products ip on ip.id = ri.ingredient_product_id
    where ppi.production_plan_id = p_plan_id
      and ip.organization_id = v_org
      and unit_conversion_factor(ri.unit, ip.unit) is not null
    group by ip.id, ip.name, ip.unit
    having sum(ri.quantity * ppi.batch_count * unit_conversion_factor(ri.unit, ip.unit)) > 0
    order by ip.name
  loop
    select current_quantity into v_before
    from inventory_levels
    where organization_id = v_org and ingredient_product_id = v_req.ingredient_product_id
    for update;
    v_before := coalesce(v_before, 0);

    insert into inventory_movements (
      organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
      reference_type, reference_id, performed_by, qty_before, qty_after
    ) values (
      v_org, v_req.ingredient_product_id, 'production_usage', -v_req.qty, v_req.unit,
      'production_plan', p_plan_id, v_user, v_before, v_before - v_req.qty
    )
    returning id into v_mov;

    -- FEFO: lotti attivi con residuo, scadenza più vicina per prima.
    v_need := v_req.qty;
    v_lots := '[]'::jsonb;
    for v_batch in
      select id, lot_number, expiry_date, quantity_remaining, unit
      from ingredient_batches
      where organization_id = v_org
        and ingredient_product_id = v_req.ingredient_product_id
        and is_active
        and quantity_remaining > 0
      order by expiry_date asc, received_at asc, id
      for update
    loop
      exit when v_need <= 0;
      v_bfactor := unit_conversion_factor(v_req.unit, v_batch.unit);
      continue when v_bfactor is null;   -- lotto in unità non convertibile: non si tocca
      v_take := least(v_batch.quantity_remaining, v_need * v_bfactor);
      continue when v_take <= 0;

      update ingredient_batches
      set quantity_remaining = quantity_remaining - v_take
      where id = v_batch.id;

      insert into production_batch_ingredients (
        organization_id, production_plan_id, ingredient_batch_id,
        ingredient_product_id, quantity_used, unit, inventory_movement_id
      ) values (
        v_org, p_plan_id, v_batch.id,
        v_req.ingredient_product_id, v_take, v_batch.unit, v_mov
      );

      v_lots := v_lots || jsonb_build_object(
        'batch_id', v_batch.id, 'lot_number', v_batch.lot_number,
        'expiry_date', v_batch.expiry_date, 'quantity', v_take, 'unit', v_batch.unit);
      v_need := v_need - v_take / v_bfactor;
    end loop;

    v_consumed := v_consumed || jsonb_build_object(
      'ingredient_product_id', v_req.ingredient_product_id,
      'ingredient_name', v_req.name,
      'quantity', v_req.qty, 'unit', v_req.unit,
      'movement_id', v_mov,
      'lots', v_lots,
      'untracked_quantity', greatest(v_need, 0));
  end loop;

  -- ── Prodotti finiti: accredito + esito dichiarato per ricetta ───────────────
  insert into finished_goods_movements (
    organization_id, recipe_id, movement_type, quantity_delta,
    reference_type, reference_id, performed_by, notes
  )
  select v_org, ppi.recipe_id, 'production_output',
         (ppi.batch_count * coalesce(r.yield_quantity, r.base_portions))::numeric,
         'production_plan', p_plan_id, v_user,
         case when exists (
           select 1 from jsonb_array_elements(v_skipped) s
           where (s ->> 'recipe_id')::uuid = ppi.recipe_id
         ) then 'consumo ingredienti INCOMPLETO: righe saltate (vedi esito del piano)' end
  from production_plan_items ppi
  join recipes r on r.id = ppi.recipe_id
  where ppi.production_plan_id = p_plan_id
    and (ppi.batch_count * coalesce(r.yield_quantity, r.base_portions)) > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
           'recipe_id', ppi.recipe_id, 'recipe_name', r.name,
           'quantity', (ppi.batch_count * coalesce(r.yield_quantity, r.base_portions))::numeric,
           'ingredients_complete', not exists (
             select 1 from jsonb_array_elements(v_skipped) s
             where (s ->> 'recipe_id')::uuid = ppi.recipe_id)
         ) order by r.name), '[]'::jsonb)
    into v_output
  from production_plan_items ppi
  join recipes r on r.id = ppi.recipe_id
  where ppi.production_plan_id = p_plan_id
    and (ppi.batch_count * coalesce(r.yield_quantity, r.base_portions)) > 0;

  v_report := jsonb_build_object(
    'version', 5,
    'plan_id', p_plan_id,
    'completed_at', now(),
    'consumed', v_consumed,
    'skipped', v_skipped,
    'output', v_output);

  update production_plans
  set status = 'completed', completed_at = now(), completion_report = v_report
  where id = p_plan_id;

  return v_report;
end;
$$;

revoke all on function public.complete_production_plan(uuid) from public, anon;
grant execute on function public.complete_production_plan(uuid) to authenticated;

comment on function public.complete_production_plan(uuid) is
  'v5 (060): −materie prime (un movimento per ingrediente, unità di magazzino) con consumo FEFO dei lotti collegato al movimento; righe con unità incompatibile saltate e DICHIARATE; +finiti. Esito jsonb restituito e salvato in production_plans.completion_report. Atomica, non ricompletabile (P0040).';
