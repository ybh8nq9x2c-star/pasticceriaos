-- =============================================================================
-- 005_inventory.sql
-- Magazzino: inventory_movements (source of truth) + inventory_levels (proiezione).
-- Trigger: ogni INSERT su inventory_movements aggiorna inventory_levels via UPSERT.
-- L'applicazione NON scrive mai direttamente su inventory_levels.
-- RLS applicata in 009_rls.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- inventory_movements
-- Ledger append-only di tutti i movimenti di magazzino.
-- Ogni entrata o uscita è un record immutabile.
-- Correzioni: inserire un nuovo movimento di tipo 'manual_adjustment'.
--
-- quantity_delta > 0 = entrata, < 0 = uscita. Zero non ammesso.
--
-- reference_type / reference_id: FK polimorfa soft (no constraint DB).
--   Valori attesi: 'purchase_order', 'production_plan', 'manual'.
--   Controllata a livello applicativo per evitare trigger di integrità circolari.
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_movements (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID            NOT NULL REFERENCES organizations(id)        ON DELETE CASCADE,
  ingredient_product_id UUID            NOT NULL REFERENCES ingredient_products(id)  ON DELETE RESTRICT,
  movement_type         movement_type   NOT NULL,
  quantity_delta        NUMERIC(10, 4)  NOT NULL,
  unit                  unit_of_measure NOT NULL,
  reference_type        TEXT,
  reference_id          UUID,
  notes                 TEXT,
  performed_by          UUID            REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),

  -- Zero non ha senso come movimento: è un no-op silenzioso pericoloso
  CONSTRAINT inventory_movements_delta_nonzero CHECK (quantity_delta <> 0),

  -- I movimenti negativi hanno senso solo per certi tipi
  CONSTRAINT inventory_movements_delta_sign CHECK (
    (movement_type IN ('purchase_receipt', 'initial_stock') AND quantity_delta > 0)
    OR (movement_type IN ('production_usage', 'waste', 'return_to_supplier') AND quantity_delta < 0)
    OR (movement_type = 'manual_adjustment') -- può essere + o -
  ),

  CONSTRAINT inventory_movements_reference_type_check CHECK (
    reference_type IS NULL
    OR reference_type IN ('purchase_order', 'production_plan', 'manual')
  ),

  -- Se reference_id è presente, reference_type deve esserlo
  CONSTRAINT inventory_movements_reference_consistency CHECK (
    (reference_id IS NULL AND reference_type IS NULL)
    OR (reference_id IS NOT NULL AND reference_type IS NOT NULL)
  ),

  -- Note obbligatorie per correzioni manuali (auditability)
  CONSTRAINT inventory_movements_manual_notes CHECK (
    movement_type <> 'manual_adjustment' OR (notes IS NOT NULL AND char_length(trim(notes)) > 0)
  )
);

COMMENT ON TABLE inventory_movements IS
  'Source of truth del magazzino. Append-only. Non aggiornare né eliminare record.';
COMMENT ON COLUMN inventory_movements.quantity_delta IS
  'Positivo = entrata, negativo = uscita. Zero non ammesso.';
COMMENT ON COLUMN inventory_movements.reference_type IS
  'Tipo entità che ha originato il movimento: purchase_order | production_plan | manual.';
COMMENT ON COLUMN inventory_movements.reference_id IS
  'ID dell''entità referenziata. FK soft: validata dall''applicazione, non dal DB.';

-- ---------------------------------------------------------------------------
-- inventory_levels
-- Proiezione del livello corrente per ogni (org, prodotto).
-- Aggiornata SOLO dal trigger su inventory_movements.
-- L'app può aggiornare min_threshold direttamente (è configurazione, non stock).
-- current_quantity: MAI scritto direttamente dall'app.
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_levels (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID            NOT NULL REFERENCES organizations(id)        ON DELETE CASCADE,
  ingredient_product_id UUID            NOT NULL REFERENCES ingredient_products(id)  ON DELETE CASCADE,
  current_quantity      NUMERIC(10, 4)  NOT NULL DEFAULT 0,
  min_threshold         NUMERIC(10, 4)  NOT NULL DEFAULT 0,
  unit                  unit_of_measure NOT NULL,
  last_updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT inventory_levels_org_product_key    UNIQUE (organization_id, ingredient_product_id),
  CONSTRAINT inventory_levels_threshold_check    CHECK  (min_threshold >= 0)
  -- current_quantity può essere negativo (stock sotto zero per errori di ricezione):
  -- non mettiamo CHECK >= 0 per evitare errori silenziosi in produzione.
);

COMMENT ON TABLE inventory_levels IS
  'Proiezione del livello stock corrente. Aggiornata solo via trigger da inventory_movements.';
COMMENT ON COLUMN inventory_levels.current_quantity IS
  'Quantità corrente. Aggiornata SOLO dal trigger trg_inventory_movement_after_insert.';
COMMENT ON COLUMN inventory_levels.min_threshold IS
  'Soglia minima di allerta. Unico campo aggiornabile direttamente dall''app.';

-- ---------------------------------------------------------------------------
-- Trigger: aggiorna inventory_levels dopo ogni INSERT su inventory_movements.
--
-- SECURITY DEFINER: la funzione gira con i privilegi del suo owner (postgres).
-- Necessario perché inventory_levels non ha policy INSERT per utenti normali
-- (l'unico modo di creare/aggiornare current_quantity è questo trigger).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_inventory_level_from_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO inventory_levels (
    organization_id,
    ingredient_product_id,
    current_quantity,
    unit,
    last_updated_at
  )
  VALUES (
    NEW.organization_id,
    NEW.ingredient_product_id,
    NEW.quantity_delta,
    NEW.unit,
    NEW.performed_at
  )
  ON CONFLICT (organization_id, ingredient_product_id)
  DO UPDATE SET
    current_quantity = inventory_levels.current_quantity + EXCLUDED.current_quantity,
    last_updated_at  = EXCLUDED.last_updated_at;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_inventory_level_from_movement() IS
  'Aggiorna inventory_levels dopo ogni movimento. SECURITY DEFINER per bypassare RLS su inventory_levels.current_quantity.';

CREATE TRIGGER trg_inventory_movement_after_insert
  AFTER INSERT ON inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_level_from_movement();
