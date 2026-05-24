-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 — Supplier Workspace Extension
-- Adds all fornitore entities without touching the cliente schema.
-- Adds FK supplier_id → supplier_account on organization and purchase_order.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE supplier_role AS ENUM (
  'supplier_owner',
  'supplier_manager',
  'supplier_operator'
);

-- Supplier-internal lifecycle; maps onto client-visible order_status:
--   ricevuto → in_attesa
--   accettato / in_preparazione → inviato
--   spedito → in_consegna
--   completato → consegnato
CREATE TYPE supplier_order_status AS ENUM (
  'ricevuto',
  'accettato',
  'in_preparazione',
  'spedito',
  'completato'
);

CREATE TYPE link_status AS ENUM ('active', 'pending', 'suspended');

-- ── Supplier Account ──────────────────────────────────────────────────────────

CREATE TABLE supplier_account (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  TEXT NOT NULL,
  owner_id      UUID NOT NULL REFERENCES auth.users(id),
  email         TEXT,
  city          TEXT,
  order_email   TEXT,
  order_method  TEXT NOT NULL DEFAULT 'email',   -- email | whatsapp | api
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE supplier_account IS
  'Fornitore workspace tenant. Mirrors organization for the supplier side.';

CREATE TRIGGER trg_supplier_account_updated_at
  BEFORE UPDATE ON supplier_account
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Supplier Memberships ──────────────────────────────────────────────────────

CREATE TABLE supplier_membership (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier_account(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        supplier_role NOT NULL DEFAULT 'supplier_owner',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(supplier_id, user_id)
);

-- ── Supplier ↔ Cliente Link ───────────────────────────────────────────────────

CREATE TABLE supplier_customer_link (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES supplier_account(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  status          link_status NOT NULL DEFAULT 'pending',
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(supplier_id, organization_id)
);

COMMENT ON TABLE supplier_customer_link IS
  'Many-to-one: many organizations can link to one supplier. Supplier sees only linked orgs.';

-- ── Wire FK: organization.supplier_id → supplier_account ────────────────────

ALTER TABLE organization
  ADD CONSTRAINT fk_organization_supplier
  FOREIGN KEY (supplier_id) REFERENCES supplier_account(id) ON DELETE SET NULL;

-- ── Wire FK: purchase_order.supplier_id → supplier_account ──────────────────

ALTER TABLE purchase_order
  ADD CONSTRAINT fk_purchase_order_supplier
  FOREIGN KEY (supplier_id) REFERENCES supplier_account(id);

-- Add supplier_status column to purchase_order
ALTER TABLE purchase_order
  ADD COLUMN supplier_status supplier_order_status DEFAULT 'ricevuto',
  ADD COLUMN supplier_notes  TEXT;

-- ── Supplier Order Status History (audit trail) ───────────────────────────────

CREATE TABLE supplier_order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  old_status  supplier_order_status,
  new_status  supplier_order_status NOT NULL,
  changed_by  UUID REFERENCES auth.users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE supplier_order_status_history IS
  'Immutable audit log of supplier order status transitions. Never deleted.';

-- ── Supplier Product Catalog ──────────────────────────────────────────────────

CREATE TABLE supplier_product_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier_account(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sku         TEXT,
  unit        ingredient_unit NOT NULL DEFAULT 'g',
  base_price  DECIMAL(10,4),
  available   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_supplier_catalog_updated_at
  BEFORE UPDATE ON supplier_product_catalog
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Supplier Price List ───────────────────────────────────────────────────────

CREATE TABLE supplier_price_list (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         UUID NOT NULL REFERENCES supplier_account(id) ON DELETE CASCADE,
  organization_id     UUID REFERENCES organization(id) ON DELETE CASCADE,  -- NULL = default for all
  catalog_product_id  UUID NOT NULL REFERENCES supplier_product_catalog(id) ON DELETE CASCADE,
  price               DECIMAL(10,4) NOT NULL,
  valid_from          DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to            DATE,
  UNIQUE(supplier_id, organization_id, catalog_product_id)
);

COMMENT ON TABLE supplier_price_list IS
  'organization_id=NULL means default price for all clients; overridden by org-specific row.';

-- ── Supplier Notifications ────────────────────────────────────────────────────

ALTER TABLE notification
  ADD COLUMN supplier_id UUID REFERENCES supplier_account(id) ON DELETE CASCADE;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_supplier_membership_user    ON supplier_membership(user_id);
CREATE INDEX idx_supplier_membership_sup     ON supplier_membership(supplier_id);
CREATE INDEX idx_supplier_customer_link_sup  ON supplier_customer_link(supplier_id);
CREATE INDEX idx_supplier_customer_link_org  ON supplier_customer_link(organization_id);
CREATE INDEX idx_purchase_order_supplier     ON purchase_order(supplier_id);
CREATE INDEX idx_purchase_order_sup_status   ON purchase_order(supplier_id, supplier_status);
CREATE INDEX idx_supplier_catalog_sup        ON supplier_product_catalog(supplier_id);
CREATE INDEX idx_supplier_price_sup          ON supplier_price_list(supplier_id);
CREATE INDEX idx_sup_order_history_order     ON supplier_order_status_history(order_id);

-- ── RLS: Supplier Workspace ───────────────────────────────────────────────────

ALTER TABLE supplier_account             ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_membership          ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_customer_link       ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_product_catalog     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_price_list          ENABLE ROW LEVEL SECURITY;

-- Helper: current supplier_id for the logged-in user
CREATE OR REPLACE FUNCTION current_supplier_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT supplier_id FROM supplier_membership
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper: current supplier role
CREATE OR REPLACE FUNCTION current_supplier_role()
RETURNS supplier_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM supplier_membership
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- supplier_account: members can read their own
CREATE POLICY supplier_account_read ON supplier_account
  FOR SELECT USING (id = current_supplier_id());

CREATE POLICY supplier_account_owner_write ON supplier_account
  FOR UPDATE USING (
    id = current_supplier_id()
    AND current_supplier_role() = 'supplier_owner'
  );

-- supplier_membership
CREATE POLICY supplier_membership_read ON supplier_membership
  FOR SELECT USING (supplier_id = current_supplier_id());

-- supplier_customer_link: supplier sees only their links; clients see only their link
CREATE POLICY supplier_link_supplier_read ON supplier_customer_link
  FOR SELECT USING (supplier_id = current_supplier_id());

CREATE POLICY supplier_link_org_read ON supplier_customer_link
  FOR SELECT USING (organization_id = current_organization_id());

CREATE POLICY supplier_link_write ON supplier_customer_link
  FOR ALL USING (
    supplier_id = current_supplier_id()
    AND current_supplier_role() IN ('supplier_owner', 'supplier_manager')
  );

-- purchase_order: suppliers see ONLY orders linked to their supplier_id
-- (they cannot see client's internal recipe/food cost data — only order+lines)
CREATE POLICY purchase_order_supplier_read ON purchase_order
  FOR SELECT USING (
    supplier_id = current_supplier_id()
    AND EXISTS (
      SELECT 1 FROM supplier_customer_link scl
      WHERE scl.supplier_id = current_supplier_id()
        AND scl.organization_id = purchase_order.organization_id
        AND scl.status = 'active'
    )
  );

-- Supplier can update supplier_status and supplier_notes on orders sent to them
CREATE POLICY purchase_order_supplier_update ON purchase_order
  FOR UPDATE USING (
    supplier_id = current_supplier_id()
    AND current_supplier_role() IN ('supplier_owner', 'supplier_manager', 'supplier_operator')
  );

-- order_line_item: supplier can read lines of orders they can see
CREATE POLICY order_line_item_supplier_read ON order_line_item
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM purchase_order po
      WHERE po.id = order_id
        AND po.supplier_id = current_supplier_id()
    )
  );

-- supplier_order_status_history: supplier sees history of their orders
CREATE POLICY sup_order_history_read ON supplier_order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM purchase_order po
      WHERE po.id = order_id AND po.supplier_id = current_supplier_id()
    )
  );

CREATE POLICY sup_order_history_insert ON supplier_order_status_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_order po
      WHERE po.id = order_id AND po.supplier_id = current_supplier_id()
    )
  );

-- supplier_product_catalog: supplier manages; clients can read products of their supplier
CREATE POLICY supplier_catalog_supplier_all ON supplier_product_catalog
  FOR ALL USING (supplier_id = current_supplier_id());

CREATE POLICY supplier_catalog_client_read ON supplier_product_catalog
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization o
      WHERE o.id = current_organization_id()
        AND o.supplier_id = supplier_id
    )
  );

-- supplier_price_list: supplier manages; clients read prices that apply to them
CREATE POLICY supplier_price_supplier_all ON supplier_price_list
  FOR ALL USING (supplier_id = current_supplier_id());

CREATE POLICY supplier_price_client_read ON supplier_price_list
  FOR SELECT USING (
    supplier_id IN (
      SELECT o.supplier_id FROM organization o
      WHERE o.id = current_organization_id()
    )
    AND (organization_id IS NULL OR organization_id = current_organization_id())
  );

-- ── Trigger: sync supplier_status → client order_status ──────────────────────

CREATE OR REPLACE FUNCTION sync_order_status_from_supplier()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Map supplier internal status to client-visible status
  IF NEW.supplier_status IS DISTINCT FROM OLD.supplier_status THEN
    NEW.status := CASE NEW.supplier_status
      WHEN 'ricevuto'         THEN 'in_attesa'::order_status
      WHEN 'accettato'        THEN 'inviato'::order_status
      WHEN 'in_preparazione'  THEN 'inviato'::order_status
      WHEN 'spedito'          THEN 'in_consegna'::order_status
      WHEN 'completato'       THEN 'consegnato'::order_status
    END;

    -- Insert audit record
    INSERT INTO supplier_order_status_history
      (order_id, old_status, new_status, changed_by)
    VALUES
      (NEW.id, OLD.supplier_status, NEW.supplier_status, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_supplier_order_status
  BEFORE UPDATE OF supplier_status ON purchase_order
  FOR EACH ROW EXECUTE FUNCTION sync_order_status_from_supplier();
