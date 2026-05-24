-- =============================================================================
-- 009_rls.sql
-- Row Level Security: helper functions + policy per tutte le tabelle operative.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current_organization_id()
--
-- MVP: restituisce la prima (e unica) organizzazione dell'utente corrente.
-- LIMIT 1 è intenzionale per MVP single-org-per-user.
--
-- LIMITE NOTO: in futuro con multi-org, questa funzione dovrà ricevere
-- l'organizzazione come parametro (passato via JWT custom claim o variabile
-- di sessione con SET LOCAL). Non modificare questa firma senza aggiornare
-- tutte le policy che la usano.
--
-- SECURITY DEFINER: legge org_members con i privilegi del owner della funzione
-- (postgres), bypassando qualsiasi policy su org_members. Necessario per
-- evitare ricorsione infinita (la policy di org_members chiama questa funzione
-- che legge org_members).
--
-- SET search_path = public: prevenzione da search_path injection attacks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM   org_members
  WHERE  user_id = auth.uid()
  LIMIT  1;
$$;

COMMENT ON FUNCTION current_organization_id() IS
  'MVP helper: restituisce la prima org dell''utente corrente. Multi-org richiederà refactor con JWT claims.';

-- ---------------------------------------------------------------------------
-- Helper: is_org_owner()
-- Usata nelle policy di delete per verificare ruolo owner senza subquery ripetute.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_org_owner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   org_members
    WHERE  user_id         = auth.uid()
      AND  organization_id = current_organization_id()
      AND  role            = 'owner'
  );
$$;

COMMENT ON FUNCTION is_org_owner() IS
  'True se l''utente corrente ha ruolo owner nella propria organizzazione.';

-- =============================================================================
-- organizations
-- =============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Un membro può vedere la propria organizzazione
CREATE POLICY "organizations_select"
ON organizations FOR SELECT
USING (id = current_organization_id());

-- Solo owner può aggiornare i dati organizzazione
CREATE POLICY "organizations_update"
ON organizations FOR UPDATE
USING (id = current_organization_id() AND is_org_owner())
WITH CHECK (id = current_organization_id());

-- INSERT: gestito da server action con service_role (onboarding).
-- Nessuna policy INSERT/DELETE qui: un utente normale non crea org da client.

-- =============================================================================
-- org_members
-- =============================================================================
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select"
ON org_members FOR SELECT
USING (organization_id = current_organization_id());

-- Solo owner può invitare nuovi membri
CREATE POLICY "org_members_insert"
ON org_members FOR INSERT
WITH CHECK (
  organization_id = current_organization_id()
  AND is_org_owner()
);

-- Solo owner può modificare ruoli, non può cambiare il proprio ruolo
CREATE POLICY "org_members_update"
ON org_members FOR UPDATE
USING (
  organization_id = current_organization_id()
  AND is_org_owner()
  AND user_id <> auth.uid()  -- non auto-modifica
)
WITH CHECK (organization_id = current_organization_id());

-- Solo owner può rimuovere membri, non se stesso
CREATE POLICY "org_members_delete"
ON org_members FOR DELETE
USING (
  organization_id = current_organization_id()
  AND is_org_owner()
  AND user_id <> auth.uid()  -- non auto-rimozione
);

-- =============================================================================
-- suppliers
-- =============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select"
ON suppliers FOR SELECT
USING (organization_id = current_organization_id());

CREATE POLICY "suppliers_insert"
ON suppliers FOR INSERT
WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "suppliers_update"
ON suppliers FOR UPDATE
USING    (organization_id = current_organization_id())
WITH CHECK (organization_id = current_organization_id());

-- Solo owner può eliminare un fornitore (ma ON DELETE RESTRICT lo protegge se ha ordini)
CREATE POLICY "suppliers_delete"
ON suppliers FOR DELETE
USING (organization_id = current_organization_id() AND is_org_owner());

-- =============================================================================
-- ingredient_products
-- =============================================================================
ALTER TABLE ingredient_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_products_select"
ON ingredient_products FOR SELECT
USING (organization_id = current_organization_id());

CREATE POLICY "ingredient_products_insert"
ON ingredient_products FOR INSERT
WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "ingredient_products_update"
ON ingredient_products FOR UPDATE
USING    (organization_id = current_organization_id())
WITH CHECK (organization_id = current_organization_id());

-- Solo owner può eliminare prodotti (ma ON DELETE RESTRICT protegge se usati in ricette/movimenti)
CREATE POLICY "ingredient_products_delete"
ON ingredient_products FOR DELETE
USING (organization_id = current_organization_id() AND is_org_owner());

-- =============================================================================
-- recipes
-- =============================================================================
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select"
ON recipes FOR SELECT
USING (organization_id = current_organization_id());

CREATE POLICY "recipes_insert"
ON recipes FOR INSERT
WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "recipes_update"
ON recipes FOR UPDATE
USING    (organization_id = current_organization_id())
WITH CHECK (organization_id = current_organization_id());

-- Solo owner può eliminare ricette
CREATE POLICY "recipes_delete"
ON recipes FOR DELETE
USING (organization_id = current_organization_id() AND is_org_owner());

-- =============================================================================
-- recipe_ingredients
-- Tabella figlia: organization_id non diretto, join tramite recipes.
-- =============================================================================
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_ingredients_select"
ON recipe_ingredients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM recipes r
    WHERE  r.id              = recipe_ingredients.recipe_id
      AND  r.organization_id = current_organization_id()
  )
);

CREATE POLICY "recipe_ingredients_insert"
ON recipe_ingredients FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM recipes r
    WHERE  r.id              = recipe_ingredients.recipe_id
      AND  r.organization_id = current_organization_id()
  )
);

CREATE POLICY "recipe_ingredients_update"
ON recipe_ingredients FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM recipes r
    WHERE  r.id              = recipe_ingredients.recipe_id
      AND  r.organization_id = current_organization_id()
  )
);

-- Chiunque nella org può modificare gli ingredienti di una ricetta (non solo owner)
CREATE POLICY "recipe_ingredients_delete"
ON recipe_ingredients FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM recipes r
    WHERE  r.id              = recipe_ingredients.recipe_id
      AND  r.organization_id = current_organization_id()
  )
);

-- =============================================================================
-- inventory_movements
-- APPEND-ONLY: solo INSERT e SELECT. Nessun UPDATE né DELETE.
-- =============================================================================
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_movements_select"
ON inventory_movements FOR SELECT
USING (organization_id = current_organization_id());

CREATE POLICY "inventory_movements_insert"
ON inventory_movements FOR INSERT
WITH CHECK (organization_id = current_organization_id());

-- Nessuna policy UPDATE: i movimenti sono immutabili.
-- Nessuna policy DELETE: i movimenti non si eliminano mai.

-- =============================================================================
-- inventory_levels
-- current_quantity: aggiornata solo da trigger (SECURITY DEFINER), mai dall'app.
-- min_threshold: aggiornabile dall'app tramite UPDATE policy.
-- Nessuna policy INSERT dall'app: il trigger SECURITY DEFINER bypassa RLS.
-- =============================================================================
ALTER TABLE inventory_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_levels_select"
ON inventory_levels FOR SELECT
USING (organization_id = current_organization_id());

-- L'app può aggiornare SOLO min_threshold (enforced applicativamente).
-- Non esiste un modo in RLS di limitare le colonne aggiornabili,
-- quindi la restriction su current_quantity è enforced nel service layer.
CREATE POLICY "inventory_levels_update"
ON inventory_levels FOR UPDATE
USING    (organization_id = current_organization_id())
WITH CHECK (organization_id = current_organization_id());

-- Nessuna policy INSERT: solo il trigger può creare righe.
-- Nessuna policy DELETE: i livelli si azzerano via movimenti, non eliminando la riga.

-- =============================================================================
-- production_plans
-- =============================================================================
ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_plans_select"
ON production_plans FOR SELECT
USING (organization_id = current_organization_id());

CREATE POLICY "production_plans_insert"
ON production_plans FOR INSERT
WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "production_plans_update"
ON production_plans FOR UPDATE
USING    (organization_id = current_organization_id())
WITH CHECK (organization_id = current_organization_id());

-- Solo owner può eliminare piani, e solo se in stato draft
CREATE POLICY "production_plans_delete"
ON production_plans FOR DELETE
USING (
  organization_id = current_organization_id()
  AND status = 'draft'
  AND is_org_owner()
);

-- =============================================================================
-- production_plan_items
-- Tabella figlia: join tramite production_plans.
-- Delete consentita a tutti i membri se il piano è in stato draft.
-- =============================================================================
ALTER TABLE production_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_plan_items_select"
ON production_plan_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM production_plans pp
    WHERE  pp.id              = production_plan_items.production_plan_id
      AND  pp.organization_id = current_organization_id()
  )
);

CREATE POLICY "production_plan_items_insert"
ON production_plan_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM production_plans pp
    WHERE  pp.id              = production_plan_items.production_plan_id
      AND  pp.organization_id = current_organization_id()
      AND  pp.status          = 'draft'  -- non si aggiungono righe a piani avviati
  )
);

CREATE POLICY "production_plan_items_update"
ON production_plan_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM production_plans pp
    WHERE  pp.id              = production_plan_items.production_plan_id
      AND  pp.organization_id = current_organization_id()
      AND  pp.status          = 'draft'
  )
);

CREATE POLICY "production_plan_items_delete"
ON production_plan_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM production_plans pp
    WHERE  pp.id              = production_plan_items.production_plan_id
      AND  pp.organization_id = current_organization_id()
      AND  pp.status          = 'draft'
  )
);

-- =============================================================================
-- purchase_orders
-- =============================================================================
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select"
ON purchase_orders FOR SELECT
USING (organization_id = current_organization_id());

CREATE POLICY "purchase_orders_insert"
ON purchase_orders FOR INSERT
WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "purchase_orders_update"
ON purchase_orders FOR UPDATE
USING    (organization_id = current_organization_id())
WITH CHECK (organization_id = current_organization_id());

-- Solo owner può eliminare ordini, e solo se in stato draft
CREATE POLICY "purchase_orders_delete"
ON purchase_orders FOR DELETE
USING (
  organization_id = current_organization_id()
  AND status = 'draft'
  AND is_org_owner()
);

-- =============================================================================
-- order_line_items
-- Tabella figlia: join tramite purchase_orders.
-- Update e delete solo su ordini in stato draft.
-- =============================================================================
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_line_items_select"
ON order_line_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE  po.id              = order_line_items.purchase_order_id
      AND  po.organization_id = current_organization_id()
  )
);

CREATE POLICY "order_line_items_insert"
ON order_line_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE  po.id              = order_line_items.purchase_order_id
      AND  po.organization_id = current_organization_id()
      AND  po.status          = 'draft'
  )
);

CREATE POLICY "order_line_items_update"
ON order_line_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE  po.id              = order_line_items.purchase_order_id
      AND  po.organization_id = current_organization_id()
      AND  po.status          = 'draft'
  )
);

CREATE POLICY "order_line_items_delete"
ON order_line_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE  po.id              = order_line_items.purchase_order_id
      AND  po.organization_id = current_organization_id()
      AND  po.status          = 'draft'
  )
);

-- =============================================================================
-- order_status_history
-- APPEND-ONLY: solo INSERT e SELECT.
-- Nessun UPDATE né DELETE: è un audit trail.
-- =============================================================================
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_status_history_select"
ON order_status_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE  po.id              = order_status_history.purchase_order_id
      AND  po.organization_id = current_organization_id()
  )
);

CREATE POLICY "order_status_history_insert"
ON order_status_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE  po.id              = order_status_history.purchase_order_id
      AND  po.organization_id = current_organization_id()
  )
);

-- Nessuna policy UPDATE o DELETE: audit trail immutabile.
