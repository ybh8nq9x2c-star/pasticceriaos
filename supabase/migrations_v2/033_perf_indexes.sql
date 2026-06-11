-- =============================================================================
-- 033_perf_indexes.sql — indici per i path di query più caldi (IF NOT EXISTS:
-- alcuni esistono già dalle migration 010/021/022/028).
-- =============================================================================

create index if not exists idx_inventory_movements_org_product
  on inventory_movements (organization_id, ingredient_product_id);

create index if not exists idx_purchase_orders_org_status
  on purchase_orders (organization_id, status);

create index if not exists idx_purchase_orders_org_supplier_status
  on purchase_orders (organization_id, supplier_id, status);

create index if not exists idx_order_line_items_order
  on order_line_items (purchase_order_id);

create index if not exists idx_production_plans_org_date
  on production_plans (organization_id, plan_date desc);

create index if not exists idx_commercial_documents_org_status
  on commercial_documents (organization_id, document_status);

-- FEFO: scadenza per prodotto (più selettivo del solo org+expiry della 028)
create index if not exists idx_ingredient_batches_fefo
  on ingredient_batches (organization_id, ingredient_product_id, expiry_date asc)
  where is_active = true and quantity_remaining > 0;

create index if not exists idx_recipe_ingredients_product
  on recipe_ingredients (ingredient_product_id);

create index if not exists idx_customer_orders_org_status_date
  on customer_orders (organization_id, status, pickup_date);
