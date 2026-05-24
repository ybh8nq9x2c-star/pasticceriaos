-- =============================================================================
-- 007_ordering.sql
-- Ciclo ordini: purchase_orders, order_line_items, order_status_history.
-- RLS applicata in 009_rls.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- purchase_orders
-- Ordine di acquisto verso un fornitore.
--
-- email_message_id: ID restituito da Resend/email provider dopo invio.
--   UNIQUE per idempotenza: se la colonna è valorizzata, l'email è già stata
--   inviata e non va reinviata. NULL = non ancora inviato.
--   Non usiamo UNIQUE parziale perché NULL è sempre distinto in SQL,
--   il UNIQUE constraint su colonne nullable esclude i NULL automaticamente.
--
-- ON DELETE RESTRICT su supplier_id:
--   Non si può eliminare un fornitore con ordini esistenti.
--   Il flusso corretto è disattivare il fornitore (is_active = false).
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_orders (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id      UUID         NOT NULL REFERENCES suppliers(id)     ON DELETE RESTRICT,
  status           order_status NOT NULL DEFAULT 'draft',
  order_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
  expected_date    DATE,
  notes            TEXT,
  total_amount     NUMERIC(12, 2),
  sent_at          TIMESTAMPTZ,
  email_message_id TEXT,
  created_by       UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- email_message_id unico quando valorizzato (idempotenza invio email)
  CONSTRAINT purchase_orders_email_message_id_key UNIQUE (email_message_id),

  CONSTRAINT purchase_orders_total_amount_check CHECK (
    total_amount IS NULL OR total_amount >= 0
  ),

  -- expected_date deve essere >= order_date se presente
  CONSTRAINT purchase_orders_expected_date_check CHECK (
    expected_date IS NULL OR expected_date >= order_date
  ),

  -- sent_at valorizzato solo se status è oltre draft
  CONSTRAINT purchase_orders_sent_at_status_check CHECK (
    (sent_at IS NULL AND status = 'draft')
    OR (sent_at IS NOT NULL AND status IN ('sent', 'confirmed', 'received', 'partial', 'cancelled'))
  )
);

CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE purchase_orders IS
  'Ordini di acquisto verso fornitori. Lifecycle: draft → sent → received/cancelled.';
COMMENT ON COLUMN purchase_orders.email_message_id IS
  'ID messaggio email (Resend/provider). UNIQUE per idempotenza: se valorizzato, email già inviata.';
COMMENT ON COLUMN purchase_orders.total_amount IS
  'Snapshot totale al momento dell''invio. Calcolato dall''app, non generato dal DB.';

-- ---------------------------------------------------------------------------
-- order_line_items
-- Righe dell'ordine con snapshot di unità e prezzo.
--
-- unit_price_snapshot: prezzo unitario al momento della creazione dell'ordine.
--   Source of truth per food cost storico. Nullable: il prezzo potrebbe non
--   essere ancora noto al momento della creazione della bozza.
--
-- quantity_received: NULL finché l'ordine non è ricevuto.
--   MVP = ricezione totale: quantity_received = quantity_ordered.
--   MVP+1 = ricezione parziale: quantity_received < quantity_ordered.
--
-- ON DELETE RESTRICT su ingredient_product_id:
--   Non si può eliminare un prodotto con righe ordine esistenti.
-- ---------------------------------------------------------------------------
CREATE TABLE order_line_items (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id     UUID            NOT NULL REFERENCES purchase_orders(id)     ON DELETE CASCADE,
  ingredient_product_id UUID            NOT NULL REFERENCES ingredient_products(id) ON DELETE RESTRICT,
  quantity_ordered      NUMERIC(10, 4)  NOT NULL,
  quantity_received     NUMERIC(10, 4),
  unit                  unit_of_measure NOT NULL,
  unit_price_snapshot   NUMERIC(10, 4),
  notes                 TEXT,

  CONSTRAINT order_line_items_quantity_ordered_check CHECK (quantity_ordered > 0),
  CONSTRAINT order_line_items_quantity_received_check CHECK (
    quantity_received IS NULL OR quantity_received >= 0
  ),
  CONSTRAINT order_line_items_price_check CHECK (
    unit_price_snapshot IS NULL OR unit_price_snapshot >= 0
  )
);

COMMENT ON TABLE order_line_items IS
  'Righe ordine con snapshot prezzi. Source of truth per food cost storico.';
COMMENT ON COLUMN order_line_items.unit_price_snapshot IS
  'Prezzo unitario al momento dell''ordine. Immutabile dopo invio per integrità storica.';
COMMENT ON COLUMN order_line_items.quantity_received IS
  'NULL = non ricevuto. MVP = uguale a quantity_ordered. MVP+1 = ricezione parziale.';

-- ---------------------------------------------------------------------------
-- order_status_history
-- Audit trail immutabile di ogni transizione di stato dell'ordine.
-- Ogni cambio di stato deve inserire un record qui, oltre ad aggiornare
-- purchase_orders.status. Append-only: no UPDATE, no DELETE.
-- ---------------------------------------------------------------------------
CREATE TABLE order_status_history (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID         NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  from_status       order_status,           -- NULL per la transizione iniziale (creazione)
  to_status         order_status NOT NULL,
  changed_by        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             TEXT,
  changed_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_status_history IS
  'Audit trail transizioni stato ordine. Append-only: mai aggiornare o eliminare record.';
COMMENT ON COLUMN order_status_history.from_status IS
  'NULL per il primo record (creazione bozza, transizione NULL → draft).';
