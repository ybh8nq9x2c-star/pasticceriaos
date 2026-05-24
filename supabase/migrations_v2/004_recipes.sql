-- =============================================================================
-- 004_recipes.sql
-- Ricettario: recipes e recipe_ingredients.
-- RLS applicata in 009_rls.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- recipes
-- Una ricetta appartiene a una organizzazione.
-- base_portions: numero di porzioni prodotte da un batch.
-- Il fabbisogno ingredienti si calcola come: quantity × batch_count.
-- ---------------------------------------------------------------------------
CREATE TABLE recipes (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,
  category        TEXT,
  emoji           TEXT    DEFAULT '🍰',
  base_portions   INTEGER NOT NULL,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipes_name_org_key       UNIQUE (organization_id, name),
  CONSTRAINT recipes_name_check         CHECK  (char_length(trim(name)) > 0),
  CONSTRAINT recipes_base_portions_check CHECK (base_portions > 0)
);

CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE recipes IS
  'Ricettario dell''organizzazione. base_portions = porzioni per singolo batch.';
COMMENT ON COLUMN recipes.base_portions IS
  'Porzioni prodotte da 1 batch. Il piano di produzione specifica quanti batch.';
COMMENT ON COLUMN recipes.is_active IS
  'Soft-delete: ricette inattive non compaiono nella pianificazione ma mantengono storico produzione.';

-- ---------------------------------------------------------------------------
-- recipe_ingredients
-- Ingredienti di una ricetta con quantità riferite a base_portions.
--
-- DECISIONE su unit:
--   Snapshot deliberato dell'unità al momento della definizione ricetta.
--   Se ingredient_products.unit cambia, le ricette esistenti non si rompono.
--   L'app deve validare coerenza unità alla creazione (stesso tipo base: peso/volume/pz).
--
-- ON DELETE RESTRICT su ingredient_product_id:
--   Non si può eliminare un prodotto usato in una ricetta attiva.
--   Il flusso corretto è disattivare prima il prodotto (is_active = false),
--   poi aggiornare le ricette che lo usano.
-- ---------------------------------------------------------------------------
CREATE TABLE recipe_ingredients (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id             UUID            NOT NULL REFERENCES recipes(id)             ON DELETE CASCADE,
  ingredient_product_id UUID            NOT NULL REFERENCES ingredient_products(id) ON DELETE RESTRICT,
  quantity              NUMERIC(10, 4)  NOT NULL,
  unit                  unit_of_measure NOT NULL,
  sort_order            INTEGER         NOT NULL DEFAULT 0,

  CONSTRAINT recipe_ingredients_recipe_product_key UNIQUE (recipe_id, ingredient_product_id),
  CONSTRAINT recipe_ingredients_quantity_check      CHECK  (quantity > 0)
);

COMMENT ON TABLE recipe_ingredients IS
  'Ingredienti per ricetta. Quantità riferite a recipes.base_portions.';
COMMENT ON COLUMN recipe_ingredients.unit IS
  'Snapshot dell''unità alla creazione. Disaccoppiato da ingredient_products.unit per stabilità.';
COMMENT ON COLUMN recipe_ingredients.quantity IS
  'Quantità necessaria per 1 batch (= base_portions porzioni).';
