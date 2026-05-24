-- =============================================================================
-- 010_indexes.sql
-- Indici per performance. Ragionamento per ogni indice.
-- I UNIQUE constraint creano già indici impliciti: non duplicarli.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- org_members
-- Lookup frequenti: trovare la org di un utente (usato da current_organization_id)
-- e trovare i membri di una org (usato dalla pagina impostazioni team).
-- ---------------------------------------------------------------------------
CREATE INDEX idx_org_members_user_id
  ON org_members (user_id);
-- organization_id già coperto dall'UNIQUE(organization_id, user_id)

-- ---------------------------------------------------------------------------
-- suppliers
-- Lookup per org (lista fornitori) e filtro is_active.
-- Indice parziale per la query più frequente: soli fornitori attivi.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_suppliers_organization_id
  ON suppliers (organization_id);

CREATE INDEX idx_suppliers_org_active
  ON suppliers (organization_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- ingredient_products
-- Lookup per org, per fornitore (quando si genera un ordine per fornitore),
-- e per prodotti attivi.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_ingredient_products_organization_id
  ON ingredient_products (organization_id);

CREATE INDEX idx_ingredient_products_supplier_id
  ON ingredient_products (supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX idx_ingredient_products_org_active
  ON ingredient_products (organization_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- recipes
-- Lookup per org e per ricette attive.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_recipes_organization_id
  ON recipes (organization_id);

CREATE INDEX idx_recipes_org_active
  ON recipes (organization_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- recipe_ingredients
-- Lookup: tutti gli ingredienti di una ricetta (join frequente nel calcolo fabbisogno).
-- Lookup inverso: tutte le ricette che usano un ingrediente (per validare delete).
-- ---------------------------------------------------------------------------
CREATE INDEX idx_recipe_ingredients_recipe_id
  ON recipe_ingredients (recipe_id);

CREATE INDEX idx_recipe_ingredients_ingredient_product_id
  ON recipe_ingredients (ingredient_product_id);

-- ---------------------------------------------------------------------------
-- inventory_movements
-- Query frequenti:
-- 1. Tutti i movimenti di un prodotto in un'org (storico magazzino)
-- 2. Movimenti per data (audit, report mensile)
-- 3. Movimenti per reference (idempotenza: "esiste già un purchase_receipt per questo ordine?")
-- 4. Lookup per org (RLS scan)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_inventory_movements_organization_id
  ON inventory_movements (organization_id);

CREATE INDEX idx_inventory_movements_org_product
  ON inventory_movements (organization_id, ingredient_product_id);

CREATE INDEX idx_inventory_movements_performed_at
  ON inventory_movements (organization_id, performed_at DESC);

-- Indice per idempotency check: trova movimenti per reference specifico
CREATE INDEX idx_inventory_movements_reference
  ON inventory_movements (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- inventory_levels
-- Lookup principale: livello corrente di un prodotto in una org.
-- La UNIQUE(organization_id, ingredient_product_id) crea già l'indice principale.
-- Indice parziale per alert dashboard: solo prodotti sotto soglia.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_inventory_levels_organization_id
  ON inventory_levels (organization_id);

-- Indice parziale per la query "scorte basse" nella dashboard KPI
CREATE INDEX idx_inventory_levels_low_stock
  ON inventory_levels (organization_id, ingredient_product_id)
  WHERE current_quantity < min_threshold;

-- Indice per stock a zero (out_of_stock alert)
CREATE INDEX idx_inventory_levels_out_of_stock
  ON inventory_levels (organization_id)
  WHERE current_quantity <= 0;

-- ---------------------------------------------------------------------------
-- production_plans
-- Query frequenti:
-- 1. Piano del giorno (organization_id, plan_date) — coperto da UNIQUE
-- 2. Piani per stato (dashboard: piani in corso, completati)
-- 3. Piani per data decrescente (storico)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_production_plans_organization_id
  ON production_plans (organization_id);

CREATE INDEX idx_production_plans_org_date
  ON production_plans (organization_id, plan_date DESC);

-- Indice parziale: solo piani attivi (draft o in_progress)
CREATE INDEX idx_production_plans_active
  ON production_plans (organization_id, plan_date)
  WHERE status IN ('draft', 'in_progress');

-- ---------------------------------------------------------------------------
-- production_plan_items
-- Lookup: tutte le righe di un piano (join nel calcolo fabbisogno).
-- Lookup inverso: tutti i piani che usano una ricetta (validazione delete ricetta).
-- ---------------------------------------------------------------------------
CREATE INDEX idx_production_plan_items_plan_id
  ON production_plan_items (production_plan_id);

CREATE INDEX idx_production_plan_items_recipe_id
  ON production_plan_items (recipe_id);

-- ---------------------------------------------------------------------------
-- purchase_orders
-- Query frequenti:
-- 1. Tutti gli ordini di una org (lista ordini)
-- 2. Ordini per stato (dashboard: ordini aperti)
-- 3. Ordini per data (storico)
-- 4. Ordini aperti: draft, sent, confirmed
-- ---------------------------------------------------------------------------
CREATE INDEX idx_purchase_orders_organization_id
  ON purchase_orders (organization_id);

CREATE INDEX idx_purchase_orders_supplier_id
  ON purchase_orders (supplier_id);

CREATE INDEX idx_purchase_orders_org_status
  ON purchase_orders (organization_id, status);

CREATE INDEX idx_purchase_orders_org_date
  ON purchase_orders (organization_id, order_date DESC);

-- Indice parziale: ordini aperti (quelli che compaiono nella dashboard)
CREATE INDEX idx_purchase_orders_open
  ON purchase_orders (organization_id, order_date DESC)
  WHERE status IN ('draft', 'sent', 'confirmed');

-- ---------------------------------------------------------------------------
-- order_line_items
-- Lookup: tutte le righe di un ordine.
-- Lookup inverso: tutti gli ordini che contengono un ingrediente (report costi).
-- ---------------------------------------------------------------------------
CREATE INDEX idx_order_line_items_purchase_order_id
  ON order_line_items (purchase_order_id);

CREATE INDEX idx_order_line_items_ingredient_product_id
  ON order_line_items (ingredient_product_id);

-- ---------------------------------------------------------------------------
-- order_status_history
-- Lookup: tutto lo storico transizioni di un ordine (pagina dettaglio ordine).
-- Lookup per data (audit trail).
-- ---------------------------------------------------------------------------
CREATE INDEX idx_order_status_history_purchase_order_id
  ON order_status_history (purchase_order_id);

CREATE INDEX idx_order_status_history_changed_at
  ON order_status_history (purchase_order_id, changed_at DESC);
