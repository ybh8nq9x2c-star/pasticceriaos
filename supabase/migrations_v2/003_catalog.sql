-- =============================================================================
-- 003_catalog.sql
-- Catalogo operativo: suppliers e ingredient_products.
-- RLS applicata in 009_rls.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- suppliers
-- Anagrafica fornitori/grossisti dell'organizzazione.
-- email è obbligatoria: è il canale di invio ordini MVP.
-- ---------------------------------------------------------------------------
CREATE TABLE suppliers (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,
  email           TEXT    NOT NULL,
  phone           TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT suppliers_name_check  CHECK (char_length(trim(name)) > 0),
  CONSTRAINT suppliers_email_check CHECK (
    email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  )
);

COMMENT ON TABLE suppliers IS
  'Fornitori/grossisti per organizzazione. email = destinatario ordini via email.';
COMMENT ON COLUMN suppliers.is_active IS
  'Soft-delete: i fornitori inattivi non compaiono nelle scelte ma mantengono lo storico ordini.';

-- ---------------------------------------------------------------------------
-- ingredient_products
-- Catalogo ingredienti/materie prime acquistabili dal fornitore.
--
-- DECISIONE su min_threshold:
--   Collocato in inventory_levels (non qui) perché è una soglia operativa
--   di stock management, non un attributo del prodotto. Un prodotto può avere
--   soglie diverse in future multi-location. Qui tiene solo unit_price come
--   cache dell'ultimo prezzo pagato (il prezzo "reale" è sulle righe ordine).
-- ---------------------------------------------------------------------------
CREATE TABLE ingredient_products (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id     UUID            REFERENCES suppliers(id) ON DELETE SET NULL,
  name            TEXT            NOT NULL,
  sku             TEXT,
  unit            unit_of_measure NOT NULL,
  unit_price      NUMERIC(10, 4),
  notes           TEXT,
  is_active       BOOLEAN         NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT ingredient_products_name_org_key UNIQUE (organization_id, name),
  CONSTRAINT ingredient_products_name_check   CHECK  (char_length(trim(name)) > 0),
  CONSTRAINT ingredient_products_price_check  CHECK  (unit_price IS NULL OR unit_price >= 0)
);

CREATE TRIGGER ingredient_products_set_updated_at
  BEFORE UPDATE ON ingredient_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE ingredient_products IS
  'Catalogo ingredienti/materie prime. Ogni prodotto appartiene a una org.';
COMMENT ON COLUMN ingredient_products.unit_price IS
  'Cache dell''ultimo prezzo pagato. Source of truth = order_line_items.unit_price_snapshot.';
COMMENT ON COLUMN ingredient_products.supplier_id IS
  'Fornitore preferenziale. SET NULL se il fornitore viene eliminato.';
COMMENT ON COLUMN ingredient_products.sku IS
  'Codice prodotto del fornitore, opzionale. Utile per email ordini e reconciliazione.';
