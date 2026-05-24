-- =============================================================================
-- 008_views.sql
-- Viste SQL per il loop operativo MVP.
-- Le viste leggono da tabelle con RLS attiva: il risultato è già filtrato
-- per l'utente corrente. Non serve WHERE organization_id = ... esplicito
-- perché le tabelle sottostanti hanno RLS che lo applica automaticamente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- v_ingredient_requirements
-- Fabbisogno ingredienti per piano di produzione.
-- Per ogni piano, calcola: richiesto, disponibile, shortage.
-- Usata nella pagina "Calcolo fabbisogno" e nella generazione bozza ordine.
--
-- ASSUNZIONE MVP: nessuna conversione unità (g ↔ kg, ml ↔ l).
-- L'app deve garantire che l'unità in recipe_ingredients coincida
-- con l'unità in inventory_levels per lo stesso prodotto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ingredient_requirements AS
SELECT
  pp.id                                            AS production_plan_id,
  pp.organization_id,
  pp.plan_date,
  pp.status                                        AS plan_status,
  ip.id                                            AS ingredient_product_id,
  ip.name                                          AS ingredient_name,
  ip.sku                                           AS ingredient_sku,
  ri.unit                                          AS ingredient_unit,
  SUM(ri.quantity * ppi.batch_count)               AS total_required,
  COALESCE(il.current_quantity, 0)                 AS available,
  GREATEST(
    SUM(ri.quantity * ppi.batch_count) - COALESCE(il.current_quantity, 0),
    0
  )                                                AS shortage,
  ip.unit_price                                    AS current_unit_price,
  -- Stima costo shortage (NULL se unit_price non disponibile)
  CASE
    WHEN ip.unit_price IS NOT NULL
    THEN GREATEST(
      SUM(ri.quantity * ppi.batch_count) - COALESCE(il.current_quantity, 0),
      0
    ) * ip.unit_price
    ELSE NULL
  END                                              AS estimated_shortage_cost,
  ip.supplier_id,
  s.name                                           AS supplier_name,
  s.email                                          AS supplier_email
FROM production_plan_items ppi
JOIN production_plans       pp  ON pp.id  = ppi.production_plan_id
JOIN recipe_ingredients     ri  ON ri.recipe_id = ppi.recipe_id
JOIN ingredient_products    ip  ON ip.id  = ri.ingredient_product_id
LEFT JOIN inventory_levels  il  ON il.ingredient_product_id = ri.ingredient_product_id
                                AND il.organization_id       = pp.organization_id
LEFT JOIN suppliers         s   ON s.id   = ip.supplier_id
GROUP BY
  pp.id,
  pp.organization_id,
  pp.plan_date,
  pp.status,
  ip.id,
  ip.name,
  ip.sku,
  ri.unit,
  il.current_quantity,
  ip.unit_price,
  ip.supplier_id,
  s.name,
  s.email;

COMMENT ON VIEW v_ingredient_requirements IS
  'Fabbisogno ingredienti per piano di produzione. Shortage = max(0, required - available). RLS applicata dalle tabelle sottostanti.';

-- ---------------------------------------------------------------------------
-- v_low_stock_alerts
-- Ingredienti sotto la soglia minima per organizzazione.
-- Usata nella dashboard KPI e nel badge sidebar magazzino.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_low_stock_alerts AS
SELECT
  il.organization_id,
  il.ingredient_product_id,
  ip.name                                         AS ingredient_name,
  ip.sku                                          AS ingredient_sku,
  il.current_quantity,
  il.min_threshold,
  il.unit,
  il.min_threshold - il.current_quantity          AS deficit,
  CASE
    WHEN il.current_quantity <= 0                       THEN 'out_of_stock'
    WHEN il.current_quantity < il.min_threshold * 0.5  THEN 'critical'
    ELSE                                                     'low'
  END                                             AS alert_level,
  il.last_updated_at,
  ip.supplier_id,
  s.name                                          AS supplier_name,
  s.email                                         AS supplier_email,
  ip.unit_price
FROM inventory_levels   il
JOIN ingredient_products ip ON ip.id = il.ingredient_product_id
LEFT JOIN suppliers      s  ON s.id  = ip.supplier_id
WHERE il.current_quantity < il.min_threshold
   OR il.current_quantity <= 0;

COMMENT ON VIEW v_low_stock_alerts IS
  'Ingredienti sotto soglia minima. alert_level: out_of_stock | critical | low.';

-- ---------------------------------------------------------------------------
-- v_dashboard_summary
-- KPI aggregate per la dashboard principale.
-- Usata da getDashboardSummary: una sola query per tutti i KPI.
-- Nota: questa vista legge da tabelle con RLS, quindi è già filtrata per org.
-- La query applicativa passa il production_plan_date come parametro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_open_orders AS
SELECT
  po.id,
  po.organization_id,
  po.status,
  po.order_date,
  po.expected_date,
  po.total_amount,
  po.sent_at,
  po.supplier_id,
  s.name   AS supplier_name,
  s.email  AS supplier_email,
  COUNT(oli.id)                  AS line_items_count,
  SUM(oli.quantity_ordered * COALESCE(oli.unit_price_snapshot, 0)) AS computed_total
FROM purchase_orders    po
JOIN suppliers          s   ON s.id  = po.supplier_id
LEFT JOIN order_line_items oli ON oli.purchase_order_id = po.id
WHERE po.status IN ('draft', 'sent', 'confirmed')
GROUP BY
  po.id, po.organization_id, po.status, po.order_date,
  po.expected_date, po.total_amount, po.sent_at,
  po.supplier_id, s.name, s.email;

COMMENT ON VIEW v_open_orders IS
  'Ordini aperti (draft, sent, confirmed) con conteggio righe e totale calcolato.';

-- ---------------------------------------------------------------------------
-- v_inventory_stock_full
-- Vista completa magazzino con stato alert e info fornitore.
-- Usata nella pagina Magazzino: include tutti i prodotti, anche sopra soglia.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_inventory_stock_full AS
SELECT
  il.organization_id,
  il.ingredient_product_id,
  ip.name                                       AS ingredient_name,
  ip.sku,
  ip.unit_price,
  il.current_quantity,
  il.min_threshold,
  il.unit,
  il.last_updated_at,
  CASE
    WHEN il.current_quantity <= 0                      THEN 'out_of_stock'
    WHEN il.current_quantity < il.min_threshold * 0.5 THEN 'critical'
    WHEN il.current_quantity < il.min_threshold        THEN 'low'
    ELSE                                                    'ok'
  END                                           AS stock_status,
  GREATEST(il.min_threshold - il.current_quantity, 0) AS deficit,
  ip.supplier_id,
  s.name                                        AS supplier_name,
  s.email                                       AS supplier_email,
  ip.is_active
FROM inventory_levels   il
JOIN ingredient_products ip ON ip.id = il.ingredient_product_id
LEFT JOIN suppliers      s  ON s.id  = ip.supplier_id;

COMMENT ON VIEW v_inventory_stock_full IS
  'Magazzino completo con stato alert calcolato. Tutti i prodotti, anche sopra soglia.';
