-- =============================================================================
-- 040_stock_truth_production_guard.sql
-- VERITÀ DEL MAGAZZINO — guardia di sufficienza sullo scarico di produzione.
--
-- Problema: complete_production_plan inseriva i movimenti production_usage
-- (negativi) senza verificare la disponibilità → lo stock poteva andare sotto
-- zero (es. Lievito -120 g). Il magazzino "mentiva".
--
-- Fix: PRIMA di inserire i movimenti, verifica che ogni ingrediente abbia
-- giacenza sufficiente. Se no, raise exception con messaggio umano → l'intera
-- transazione rolla back (nessuno scarico parziale, nessun doppio consumo al
-- retry). Il confronto usa la quantità RAW (ri.quantity * batch_count), coerente
-- con come il trigger trg_inventory_movement_after_insert decrementa il livello.
--
-- ADDITIVE & SAFE: sostituisce solo il corpo della funzione (firma invariata).
-- La logica FEFO sui lotti resta identica. Le rettifiche manuali (manual_adjustment)
-- NON sono toccate: restano l'unico modo esplicito di portare lo stock a un
-- conteggio reale (sempre >= 0).
-- =============================================================================

create or replace function public.complete_production_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org    uuid;
  v_status plan_status;
  v_user   uuid := auth.uid();
  v_req    record;
  v_batch  record;
  v_need   numeric;
  v_take   numeric;
  v_factor numeric;
  v_short  record;
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

  -- 0) GUARDIA VERITÀ DEL MAGAZZINO: blocca se un ingrediente è insufficiente.
  --    (lo stock non può mentire: prima carica/rettifica, poi registra la produzione)
  for v_short in
    select ip.name,
           coalesce(lvl.current_quantity, 0) as avail,
           req.needed,
           ip.unit
    from (
      select ri.ingredient_product_id,
             sum(ri.quantity * ppi.batch_count) as needed
      from production_plan_items ppi
      join recipe_ingredients ri on ri.recipe_id = ppi.recipe_id
      where ppi.production_plan_id = p_plan_id
      group by ri.ingredient_product_id
    ) req
    join ingredient_products ip on ip.id = req.ingredient_product_id
    left join inventory_levels lvl
      on lvl.organization_id = v_org and lvl.ingredient_product_id = req.ingredient_product_id
    where req.needed > coalesce(lvl.current_quantity, 0)
    order by ip.name
    limit 1
  loop
    raise exception
      'Stock insufficiente per "%": disponibili % %, richiesti % per questa produzione. Carica o rettifica il magazzino prima di registrare.',
      v_short.name, v_short.avail, v_short.unit, v_short.needed
      using errcode = 'P0050';
  end loop;

  -- 1) Movimenti di consumo (source of truth)
  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select v_org, ri.ingredient_product_id, 'production_usage',
         -(ri.quantity * ppi.batch_count), ri.unit,
         'production_plan', p_plan_id, v_user
  from production_plan_items ppi
  join recipe_ingredients ri on ri.recipe_id = ppi.recipe_id
  where ppi.production_plan_id = p_plan_id;

  -- 2) Consumo FEFO dei lotti tracciati (best-effort, mai bloccante):
  for v_req in
    select ri.ingredient_product_id,
           ip.unit as product_unit,
           sum(ri.quantity * ppi.batch_count * coalesce(unit_conversion_factor(ri.unit, ip.unit), 1)) as total_qty
    from production_plan_items ppi
    join recipe_ingredients ri on ri.recipe_id = ppi.recipe_id
    join ingredient_products ip on ip.id = ri.ingredient_product_id
    where ppi.production_plan_id = p_plan_id
    group by ri.ingredient_product_id, ip.unit
  loop
    v_need := v_req.total_qty;
    for v_batch in
      select id, quantity_remaining, unit
      from ingredient_batches
      where organization_id = v_org
        and ingredient_product_id = v_req.ingredient_product_id
        and is_active and quantity_remaining > 0
      order by expiry_date asc, received_at asc
      for update
    loop
      exit when v_need <= 0;
      v_factor := coalesce(unit_conversion_factor(v_req.product_unit, v_batch.unit), 1);
      v_take := least(v_batch.quantity_remaining, v_need * v_factor);
      if v_take > 0 then
        update ingredient_batches
          set quantity_remaining = quantity_remaining - v_take
        where id = v_batch.id;

        insert into production_batch_ingredients (
          organization_id, production_plan_id, ingredient_batch_id,
          ingredient_product_id, quantity_used, unit
        ) values (
          v_org, p_plan_id, v_batch.id,
          v_req.ingredient_product_id, v_take, v_batch.unit
        );
        v_need := v_need - (v_take / v_factor);
      end if;
    end loop;
  end loop;

  update production_plans
  set status = 'completed', completed_at = now()
  where id = p_plan_id;
end;
$$;

comment on function public.complete_production_plan(uuid) is
  'Scarico produzione transazionale (movimenti production_usage + FEFO). Guardia verità-magazzino: blocca se un ingrediente è insufficiente (no stock negativo). Le rettifiche manuali restano l''eccezione esplicita.';
