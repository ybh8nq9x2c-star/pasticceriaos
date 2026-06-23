-- =============================================================================
-- diagnostics/unit_consistency.sql
-- DIAGNOSTICA OPERATIVA (sola lettura) per il rischio #1 dell'audit: i movimenti
-- di magazzino possono essere registrati in UNITÀ DIVERSE per lo stesso
-- ingrediente, e il trigger inventory_levels somma i delta SENZA conversione.
--
-- Produttori di movimenti e unità usata:
--   • purchase_receipt   → order_line_items.unit      (019 receive_purchase_order)
--   • production_usage   → recipe_ingredients.unit    (019 complete_production_plan) ← NON converte
--   • sale_deduction     → ingredient_products.unit   (042 ingest_sale, già convertito) ← converte
--   • initial/manual     → unit scelta dall'utente     (inventory/service)
--
-- Se per un ingrediente convivono più unità, inventory_levels.current_quantity è
-- corrotto (es. somma grammi a chilogrammi → errore 1000×). Esegui come read-only.
-- Sostituisci :org con l'organization_id, oppure togli i filtri per scansione globale.
-- =============================================================================

-- (1) Ricette i cui ingredienti usano un'unità DIVERSA dall'unità di magazzino
--     del prodotto. È il bacino di rischio: una produzione su questi ingredienti
--     registra un movimento NON convertito. (recipe_unit ≠ product_unit)
select r.id as recipe_id, r.name as recipe, ip.name as ingredient,
       ri.unit as recipe_unit, ip.unit as product_unit,
       public.unit_conversion_factor(ri.unit, ip.unit) as factor  -- null = NON convertibile
from recipe_ingredients ri
join ingredient_products ip on ip.id = ri.ingredient_product_id
join recipes r on r.id = ri.recipe_id
where ri.unit <> ip.unit
order by factor nulls first, r.name;

-- (2) Ingredienti con movimenti registrati in PIÙ DI UNA unità (corruzione GIÀ
--     avvenuta nel ledger: i delta sono stati sommati raw).
select ingredient_product_id,
       array_agg(distinct unit::text) as units,
       count(*) as movements
from inventory_movements
group by ingredient_product_id
having count(distinct unit) > 1
order by count(*) desc;

-- (3) Movimenti la cui unità NON coincide con l'unità della proiezione livello
--     (ogni riga qui è un delta sommato nell'unità sbagliata).
select m.ingredient_product_id, ip.name as ingredient,
       m.movement_type, m.unit as movement_unit, l.unit as level_unit, count(*) as n
from inventory_movements m
join inventory_levels l
  on l.organization_id = m.organization_id and l.ingredient_product_id = m.ingredient_product_id
left join ingredient_products ip on ip.id = m.ingredient_product_id
where m.unit <> l.unit
group by 1, 2, 3, 4, 5
order by n desc;

-- (4) Livelli la cui unità NON è l'unità canonica del prodotto (sintomo che il
--     primo movimento ha "congelato" un'unità diversa da ingredient_products.unit).
select l.ingredient_product_id, ip.name as ingredient,
       l.unit as level_unit, ip.unit as product_unit, l.current_quantity
from inventory_levels l
join ingredient_products ip on ip.id = l.ingredient_product_id
where l.unit <> ip.unit;
