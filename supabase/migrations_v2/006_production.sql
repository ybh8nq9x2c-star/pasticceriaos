-- =============================================================================
-- 006_production.sql
-- Pianificazione produzione: production_plans e production_plan_items.
-- RLS applicata in 009_rls.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- production_plans
-- Piano di produzione giornaliero per un'organizzazione.
-- UNIQUE(organization_id, plan_date): un solo piano per giorno per org.
-- La chiusura del piano (status → completed) genera movimenti production_usage
-- in inventory_movements (logica applicativa, non trigger DB).
-- ---------------------------------------------------------------------------
CREATE TABLE production_plans (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_date       DATE        NOT NULL,
  status          plan_status NOT NULL DEFAULT 'draft',
  notes           TEXT,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT production_plans_date_org_key UNIQUE (organization_id, plan_date),

  -- completed_at deve essere valorizzato solo se status = completed
  CONSTRAINT production_plans_completed_at_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE TRIGGER production_plans_set_updated_at
  BEFORE UPDATE ON production_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE production_plans IS
  'Piano di produzione giornaliero. Un solo piano attivo per (org, data).';
COMMENT ON COLUMN production_plans.plan_date IS
  'Data di produzione pianificata. Tipo DATE (no timezone): data di laboratorio.';
COMMENT ON COLUMN production_plans.completed_at IS
  'Timestamp chiusura produzione. NULL finché status != completed.';

-- ---------------------------------------------------------------------------
-- production_plan_items
-- Righe del piano: quale ricetta, quanti batch.
-- batch_count: numero di volte che si ripete la ricetta (1 batch = base_portions porzioni).
-- Totale porzioni = batch_count × recipes.base_portions.
--
-- ON DELETE RESTRICT su recipe_id:
--   Non si può eliminare una ricetta usata in piani esistenti.
--   Il flusso corretto è disattivare la ricetta (is_active = false).
-- ---------------------------------------------------------------------------
CREATE TABLE production_plan_items (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  production_plan_id UUID    NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  recipe_id          UUID    NOT NULL REFERENCES recipes(id)           ON DELETE RESTRICT,
  batch_count        INTEGER NOT NULL,
  notes              TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT production_plan_items_plan_recipe_key UNIQUE (production_plan_id, recipe_id),
  CONSTRAINT production_plan_items_batch_count_check CHECK (batch_count > 0)
);

COMMENT ON TABLE production_plan_items IS
  'Righe del piano di produzione. batch_count × recipe.base_portions = porzioni totali.';
COMMENT ON COLUMN production_plan_items.batch_count IS
  'Numero di batch da produrre. Fabbisogno ingredienti = recipe_ingredients.quantity × batch_count.';
