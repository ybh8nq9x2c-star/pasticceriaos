-- =============================================================================
-- 043_production_unit_conversion.sql
-- R1 (audit): STOP alla corruzione magazzino da unità miste.
--
-- Problema: complete_production_plan (019) registrava i movimenti production_usage
-- nell'unità della RICETTA (recipe_ingredients.unit) SENZA conversione, mentre:
--   • sale_deduction (042) deduce in ingredient_products.unit (convertito)
--   • v_ingredient_requirements (021) somma in ingredient_products.unit (convertito)
-- Il trigger inventory_levels somma i delta RAW: un movimento in un'unità diversa
-- da quella del livello corrompe il saldo (es. grammi sommati a chilogrammi → 1000×).
--
-- Fix: la deduzione di produzione converte alla UNITÀ DI MAGAZZINO del prodotto
-- (ingredient_products.unit) via unit_conversion_factor, e registra il movimento
-- in quell'unità — esattamente come la vendita. Gli ingredienti con unità NON
-- convertibile (factor NULL, es. ricetta 'g' vs prodotto 'pz') vengono SALTATI:
-- meglio una sotto-deduzione visibile che una corruzione silenziosa del saldo.
-- (La validazione lato app — recipe create/edit — impedisce nuovi casi simili.)
--
-- ADDITIVE & SAFE: create or replace della sola funzione. Nessuna riga storica
-- toccata. Si applica alle FUTURE chiusure piano. Reversibile: ripristinare 019.
-- =============================================================================

create or replace function public.complete_production_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_status plan_status;
  v_user   uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'complete_production_plan: utente non autenticato' using errcode = 'P0001';
  end if;

  -- LOCK della riga piano PRIMA di decidere: serializza complete concorrenti.
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

  -- Movimenti di uscita (negativi) PRIMA del cambio stato, CONVERTITI all'unità
  -- di magazzino (ip.unit). Salta gli ingredienti con unità non convertibile
  -- (factor NULL) per non corrompere il saldo con un'unità incoerente.
  insert into inventory_movements (
    organization_id, ingredient_product_id, movement_type, quantity_delta, unit,
    reference_type, reference_id, performed_by
  )
  select v_org, ri.ingredient_product_id, 'production_usage',
         -(ri.quantity * ppi.batch_count * unit_conversion_factor(ri.unit, ip.unit)),
         ip.unit,                                  -- unità di MAGAZZINO (canonica)
         'production_plan', p_plan_id, v_user
  from production_plan_items ppi
  join recipe_ingredients  ri on ri.recipe_id = ppi.recipe_id
  join ingredient_products ip on ip.id = ri.ingredient_product_id
  where ppi.production_plan_id = p_plan_id
    and unit_conversion_factor(ri.unit, ip.unit) is not null;  -- skip non-convertibili

  update production_plans
  set status = 'completed', completed_at = now()
  where id = p_plan_id;
end;
$$;

revoke all on function public.complete_production_plan(uuid) from public, anon;
grant execute on function public.complete_production_plan(uuid) to authenticated;

comment on function public.complete_production_plan(uuid) is
  'Chiusura piano atomica: movimenti production_usage CONVERTITI all''unità di magazzino (ip.unit) via unit_conversion_factor; non-convertibili saltati. Coerente con sale_deduction e v_ingredient_requirements. SECURITY DEFINER con org-check.';

-- Rollback: ripristinare la versione 019 (deduzione in ri.unit, senza conversione).
