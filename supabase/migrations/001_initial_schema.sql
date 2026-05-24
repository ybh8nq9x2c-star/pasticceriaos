-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001 — Initial Schema (Cliente Workspace)
-- Entity names from entity-list-1.md; 4-state order lifecycle from user-flows-1.md
-- Multi-tenancy enforced via organization_id on every operational table + RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE account_type AS ENUM ('cliente', 'fornitore');

CREATE TYPE client_role AS ENUM (
  'titolare',
  'responsabile_laboratorio',
  'operatore'
);

CREATE TYPE order_status AS ENUM (
  'in_attesa',
  'inviato',
  'in_consegna',
  'consegnato'
);

CREATE TYPE stock_status AS ENUM ('ok', 'warn', 'danger');

CREATE TYPE ingredient_unit AS ENUM (
  'g', 'kg', 'ml', 'lt', 'pz', 'bustina', 'conf'
);

CREATE TYPE recipe_category AS ENUM (
  'Lievitati', 'Torte', 'Monoporzioni', 'Biscotti', 'Semifreddi'
);

-- ── User Profiles (extends auth.users) ───────────────────────────────────────

CREATE TABLE user_profile (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  account_type  account_type NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_profile IS
  'Extends auth.users. account_type determines which workspace the user belongs to.';

-- ── Subscription Plans (SEED — not tenant-specific) ──────────────────────────

CREATE TABLE subscription_plan (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL UNIQUE,        -- Starter, Pro, Enterprise
  price_eur            DECIMAL(10,2) NOT NULL,
  max_recipes          INT NOT NULL DEFAULT 25,
  auto_order           BOOLEAN NOT NULL DEFAULT FALSE,
  advanced_analytics   BOOLEAN NOT NULL DEFAULT FALSE,
  ai_prediction        BOOLEAN NOT NULL DEFAULT FALSE,
  max_suppliers        INT NOT NULL DEFAULT 1,
  api_integration      BOOLEAN NOT NULL DEFAULT FALSE,
  multi_location       BOOLEAN NOT NULL DEFAULT FALSE,
  priority_support     BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE subscription_plan IS
  'SEED data — 3 tiers from hardcoded-data-1.md. Feature gates stored here, never in business logic.';

-- ── Organizations (Cliente Workspace) ────────────────────────────────────────

CREATE TABLE organization (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  owner_id             UUID NOT NULL REFERENCES auth.users(id),
  city                 TEXT,
  email                TEXT,
  supplier_id          UUID,                        -- FK set after supplier link
  subscription_plan_id UUID REFERENCES subscription_plan(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organization IS
  'One row per pasticceria (tenant). supplier_id is FK to supplier_account (added in migration 002).';

-- ── Customer Memberships ──────────────────────────────────────────────────────

CREATE TABLE customer_membership (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            client_role NOT NULL DEFAULT 'titolare',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

COMMENT ON TABLE customer_membership IS
  'RBAC for cliente workspace. 3 roles from roles-and-permissions-1.md.';

-- ── Organization Settings ─────────────────────────────────────────────────────

CREATE TABLE organization_settings (
  organization_id    UUID PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  order_advance_days INT NOT NULL DEFAULT 2,
  auto_order_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  order_send_method  TEXT NOT NULL DEFAULT 'email',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organization_settings IS
  'CONFIG data from hardcoded-data-1.md. Created with defaults at org signup.';

-- ── Ingredient Products ───────────────────────────────────────────────────────

CREATE TABLE ingredient_product (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,           -- e.g. "farina-00"
  name            TEXT NOT NULL,
  sku             TEXT,
  unit            ingredient_unit NOT NULL DEFAULT 'g',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

COMMENT ON TABLE ingredient_product IS
  'Canonical entity name from entity-list-1.md. Scoped per organization.';

-- ── Inventory Stock ───────────────────────────────────────────────────────────

CREATE TABLE inventory_stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES ingredient_product(id) ON DELETE CASCADE,
  qty             DECIMAL(12,3) NOT NULL DEFAULT 0,
  threshold       DECIMAL(12,3) NOT NULL DEFAULT 0,
  -- status is computed: entity-list-1.md formula: pct = min(100, round(qty/(threshold*3)*100))
  -- Using simpler threshold-based classification for storage:
  status          stock_status NOT NULL GENERATED ALWAYS AS (
    CASE
      WHEN qty <= threshold * 0.5 THEN 'danger'::stock_status
      WHEN qty <= threshold       THEN 'warn'::stock_status
      ELSE                             'ok'::stock_status
    END
  ) STORED,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, product_id)
);

COMMENT ON TABLE inventory_stock IS
  'entity-list-1.md entity. status is DB-computed from qty/threshold ratio.';

-- ── Recipes ───────────────────────────────────────────────────────────────────

CREATE TABLE recipe (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  slug                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  emoji                 TEXT NOT NULL DEFAULT '🍰',
  portions              INT NOT NULL DEFAULT 8,
  category              recipe_category,
  food_cost_per_portion DECIMAL(10,4),       -- derived from ingredient prices; recomputed on save
  margin_percentage     DECIMAL(5,2),
  deleted_at            TIMESTAMPTZ,         -- soft delete: referenced in historical orders
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- ── Recipe Ingredients ────────────────────────────────────────────────────────

CREATE TABLE recipe_ingredient (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  UUID NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES ingredient_product(id) ON DELETE RESTRICT,
  qty        DECIMAL(12,3) NOT NULL,
  unit       ingredient_unit NOT NULL DEFAULT 'g',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Production Plans ──────────────────────────────────────────────────────────

CREATE TABLE production_plan (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  plan_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, plan_date)
);

CREATE TABLE production_plan_item (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID NOT NULL REFERENCES production_plan(id) ON DELETE CASCADE,
  recipe_id  UUID NOT NULL REFERENCES recipe(id) ON DELETE RESTRICT,
  target_qty INT NOT NULL DEFAULT 0,
  CHECK (target_qty > 0)
);

-- ── Purchase Orders ───────────────────────────────────────────────────────────

CREATE TABLE purchase_order (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL,  -- FK to supplier_account added in migration 002
  order_number      TEXT NOT NULL UNIQUE,
  -- 4-step lifecycle confirmed by user-flows-1.md Flow 7 and Flow 14
  status            order_status NOT NULL DEFAULT 'in_attesa',
  total_amount      DECIMAL(10,2),
  supplier_notes    TEXT,
  client_notes      TEXT,
  -- idempotency_key prevents double-send (risk identified in user-flows-1.md Flow 7 edge case)
  idempotency_key   TEXT UNIQUE,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_line_item (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES ingredient_product(id) ON DELETE RESTRICT,
  supplier_sku TEXT,
  quantity     DECIMAL(12,3) NOT NULL,
  unit         ingredient_unit NOT NULL DEFAULT 'g',
  unit_price   DECIMAL(10,4),
  line_total   DECIMAL(10,2) GENERATED ALWAYS AS (
    ROUND((quantity * unit_price)::NUMERIC, 2)
  ) STORED
);

COMMENT ON TABLE order_line_item IS
  'entity-list-1.md: order_line_item. Existed in prototype order modal but not in JS ORDERS array.';

-- ── Notifications ─────────────────────────────────────────────────────────────

CREATE TABLE notification (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organization(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,     -- 'low_stock' | 'order_sent' | 'order_delivered' | ...
  title           TEXT NOT NULL,
  message         TEXT,
  severity        TEXT NOT NULL DEFAULT 'info',
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_customer_membership_user   ON customer_membership(user_id);
CREATE INDEX idx_customer_membership_org    ON customer_membership(organization_id);
CREATE INDEX idx_ingredient_product_org     ON ingredient_product(organization_id);
CREATE INDEX idx_inventory_stock_org        ON inventory_stock(organization_id);
CREATE INDEX idx_inventory_stock_status     ON inventory_stock(status) WHERE status IN ('warn', 'danger');
CREATE INDEX idx_recipe_org                 ON recipe(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipe_ingredient_recipe   ON recipe_ingredient(recipe_id);
CREATE INDEX idx_production_plan_date       ON production_plan(organization_id, plan_date);
CREATE INDEX idx_purchase_order_org         ON purchase_order(organization_id);
CREATE INDEX idx_purchase_order_status      ON purchase_order(status);
CREATE INDEX idx_order_line_item_order      ON order_line_item(order_id);
CREATE INDEX idx_notification_org_unread    ON notification(organization_id) WHERE read_at IS NULL;

-- ── Helper: auto-update updated_at ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profile_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_organization_updated_at
  BEFORE UPDATE ON organization
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recipe_updated_at
  BEFORE UPDATE ON recipe
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_purchase_order_updated_at
  BEFORE UPDATE ON purchase_order
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_stock_updated_at
  BEFORE UPDATE ON inventory_stock
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security (RLS) ──────────────────────────────────────────────────

ALTER TABLE user_profile         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_membership  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_product   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe               ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredient    ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_plan      ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_plan_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_item      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification         ENABLE ROW LEVEL SECURITY;

-- Helper function: returns the organization_id for the current user (cliente)
CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM customer_membership
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper function: returns current user's client role
CREATE OR REPLACE FUNCTION current_client_role()
RETURNS client_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM customer_membership
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- user_profile: users can only read/write their own row
CREATE POLICY user_profile_own ON user_profile
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- organization: members can read their org
CREATE POLICY organization_member_read ON organization
  FOR SELECT USING (id = current_organization_id());

-- organization: only titolare can update
CREATE POLICY organization_titolare_update ON organization
  FOR UPDATE USING (
    id = current_organization_id()
    AND current_client_role() = 'titolare'
  );

-- customer_membership: members can see their org's memberships
CREATE POLICY membership_org_read ON customer_membership
  FOR SELECT USING (organization_id = current_organization_id());

-- organization_settings: members read, titolare writes
CREATE POLICY org_settings_read ON organization_settings
  FOR SELECT USING (organization_id = current_organization_id());

CREATE POLICY org_settings_titolare_write ON organization_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    AND current_client_role() = 'titolare'
  );

-- ingredient_product: all members read; titolare+resp write
CREATE POLICY ingredient_product_read ON ingredient_product
  FOR SELECT USING (organization_id = current_organization_id());

CREATE POLICY ingredient_product_write ON ingredient_product
  FOR ALL USING (
    organization_id = current_organization_id()
    AND current_client_role() IN ('titolare', 'responsabile_laboratorio')
  );

-- inventory_stock: all members read; all members update (operatore can update qty)
CREATE POLICY inventory_stock_read ON inventory_stock
  FOR SELECT USING (organization_id = current_organization_id());

CREATE POLICY inventory_stock_write ON inventory_stock
  FOR ALL USING (organization_id = current_organization_id());

-- recipe: all members read (non-deleted); titolare+resp write
CREATE POLICY recipe_read ON recipe
  FOR SELECT USING (
    organization_id = current_organization_id()
    AND deleted_at IS NULL
  );

CREATE POLICY recipe_write ON recipe
  FOR ALL USING (
    organization_id = current_organization_id()
    AND current_client_role() IN ('titolare', 'responsabile_laboratorio')
  );

-- recipe_ingredient: join through recipe
CREATE POLICY recipe_ingredient_read ON recipe_ingredient
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM recipe r
      WHERE r.id = recipe_id
        AND r.organization_id = current_organization_id()
        AND r.deleted_at IS NULL
    )
  );

CREATE POLICY recipe_ingredient_write ON recipe_ingredient
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recipe r
      WHERE r.id = recipe_id
        AND r.organization_id = current_organization_id()
    )
    AND current_client_role() IN ('titolare', 'responsabile_laboratorio')
  );

-- production_plan: all members read; titolare+resp write
CREATE POLICY production_plan_read ON production_plan
  FOR SELECT USING (organization_id = current_organization_id());

CREATE POLICY production_plan_write ON production_plan
  FOR ALL USING (
    organization_id = current_organization_id()
    AND current_client_role() IN ('titolare', 'responsabile_laboratorio')
  );

CREATE POLICY production_plan_item_read ON production_plan_item
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM production_plan pp
      WHERE pp.id = plan_id AND pp.organization_id = current_organization_id()
    )
  );

CREATE POLICY production_plan_item_write ON production_plan_item
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM production_plan pp
      WHERE pp.id = plan_id AND pp.organization_id = current_organization_id()
    )
    AND current_client_role() IN ('titolare', 'responsabile_laboratorio')
  );

-- purchase_order: all members read; titolare+resp create; operatore mark-received only
CREATE POLICY purchase_order_read ON purchase_order
  FOR SELECT USING (organization_id = current_organization_id());

CREATE POLICY purchase_order_write ON purchase_order
  FOR ALL USING (
    organization_id = current_organization_id()
    AND current_client_role() IN ('titolare', 'responsabile_laboratorio')
  );

-- order_line_item: access through purchase_order
CREATE POLICY order_line_item_read ON order_line_item
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM purchase_order po
      WHERE po.id = order_id AND po.organization_id = current_organization_id()
    )
  );

CREATE POLICY order_line_item_write ON order_line_item
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM purchase_order po
      WHERE po.id = order_id AND po.organization_id = current_organization_id()
    )
    AND current_client_role() IN ('titolare', 'responsabile_laboratorio')
  );

-- notifications: users see their org's notifications
CREATE POLICY notification_read ON notification
  FOR SELECT USING (
    organization_id = current_organization_id()
    OR user_id = auth.uid()
  );

CREATE POLICY notification_write ON notification
  FOR UPDATE USING (
    organization_id = current_organization_id()
    OR user_id = auth.uid()
  );

-- subscription_plan: publicly readable (needed for upgrade UI)
ALTER TABLE subscription_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_plan_public_read ON subscription_plan
  FOR SELECT USING (true);
