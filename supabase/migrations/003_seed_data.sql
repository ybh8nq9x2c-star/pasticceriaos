-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — Seed + Demo Data
-- SEED: subscription plans (from hardcoded-data-1.md — belong to the platform)
-- DEMO: one cliente org + one fornitore account for end-to-end testing
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SEED: Subscription Plans ──────────────────────────────────────────────────
-- Source: hardcoded-data-1.md > SUBSCRIPTION_PLANS, renderSubscriptionTable()

INSERT INTO subscription_plan
  (id, name, price_eur, max_recipes, auto_order, advanced_analytics,
   ai_prediction, max_suppliers, api_integration, multi_location, priority_support)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Starter',    29.00,  25, FALSE, FALSE, FALSE, 1, FALSE, FALSE, FALSE),
  ('00000000-0000-0000-0000-000000000002',
   'Pro',        59.00, -1,  TRUE,  TRUE,  TRUE,  3, FALSE, FALSE, FALSE),
  ('00000000-0000-0000-0000-000000000003',
   'Enterprise', 129.00, -1, TRUE,  TRUE,  TRUE, -1, TRUE,  TRUE,  TRUE)
ON CONFLICT (name) DO NOTHING;

-- max_recipes = -1 means unlimited

-- ─────────────────────────────────────────────────────────────────────────────
-- DEMO DATA — for local testing only.
-- Replace UUIDs with real auth.users IDs when testing with real Supabase Auth.
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: In production, user_profile rows are inserted by the signup server action.
-- For local seeding without real auth, you can insert placeholder rows:

/*
-- Demo cliente user (Pasticceria Rossi - Marco)
INSERT INTO user_profile (id, full_name, email, account_type)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Marco Rossi', 'marco@pasticceriarossi.it', 'cliente');

-- Demo fornitore user (Ingrosso Bianchi)
INSERT INTO user_profile (id, full_name, email, account_type)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'Luca Bianchi', 'luca@ingrossobianchi.it', 'fornitore');

-- Demo supplier account
INSERT INTO supplier_account (id, company_name, owner_id, email, city, order_email, order_method)
VALUES
  ('aa000000-0000-0000-0000-000000000001',
   'Ingrosso Bianchi Srl',
   '22222222-2222-2222-2222-222222222222',
   'info@ingrossobianchi.it', 'Milano',
   'ordini@ingrossobianchi.it', 'email');

-- Demo supplier membership
INSERT INTO supplier_membership (supplier_id, user_id, role)
VALUES
  ('aa000000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'supplier_owner');

-- Demo organization
INSERT INTO organization (id, name, owner_id, city, email, supplier_id, subscription_plan_id)
VALUES
  ('bb000000-0000-0000-0000-000000000001',
   'Pasticceria Rossi',
   '11111111-1111-1111-1111-111111111111',
   'Milano', 'info@pasticceriarossi.it',
   'aa000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002');

-- Demo customer membership (titolare)
INSERT INTO customer_membership (organization_id, user_id, role)
VALUES
  ('bb000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'titolare');

-- Demo org settings
INSERT INTO organization_settings (organization_id, order_advance_days, auto_order_enabled, order_send_method)
VALUES
  ('bb000000-0000-0000-0000-000000000001', 2, FALSE, 'email');

-- Demo supplier-client link
INSERT INTO supplier_customer_link (supplier_id, organization_id, status)
VALUES
  ('aa000000-0000-0000-0000-000000000001',
   'bb000000-0000-0000-0000-000000000001',
   'active');

-- Demo supplier catalog
INSERT INTO supplier_product_catalog (id, supplier_id, name, sku, unit, base_price, available)
VALUES
  ('cc000001-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Farina 00 (25kg)',           'FAR00-25KG',  'kg',  18.50, TRUE),
  ('cc000002-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Burro blocco 1kg',           'BURRO-1KG',   'kg',   8.90, TRUE),
  ('cc000003-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Zucchero semolato 5kg',      'ZUCC-SEM-5',  'kg',   5.20, TRUE),
  ('cc000004-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Uova fresche (conf. 30)',    'UOVA-F30',    'pz',   9.80, TRUE),
  ('cc000005-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Mascarpone 500g',            'MASC-500',    'g',    3.20, TRUE),
  ('cc000006-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Panna fresca 1lt',           'PANNA-1L',    'lt',   2.90, TRUE),
  ('cc000007-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Cacao amaro 1kg',            'CAC-AM-1K',   'kg',  14.50, FALSE),
  ('cc000008-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Cioccolato fondente 1kg',    'CIOC-F-1K',   'kg',  12.80, TRUE),
  ('cc000009-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Ricotta fresca 500g',        'RIC-F-500',   'g',    2.40, TRUE),
  ('cc000010-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Mandorle sgusciate 500g',    'MAN-SG-500',  'g',    6.80, TRUE);

-- Demo ingredient products for Pasticceria Rossi
INSERT INTO ingredient_product (id, organization_id, slug, name, sku, unit)
VALUES
  ('dd000001-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'farina-00',         'Farina 00 (5kg)',            'FAR00-5KG',   'g'),
  ('dd000002-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'burro-1kg',         'Burro blocco 1kg',           'BURRO-1KG',   'g'),
  ('dd000003-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'uova-frische',      'Uova fresche (conf. 6)',      'UOVA-F6',     'pz'),
  ('dd000004-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'zucchero-semolato', 'Zucchero semolato 1kg',      'ZUCC-SEM',    'g'),
  ('dd000005-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'mascarpone-500',    'Mascarpone 500g',            'MASC-500',    'g'),
  ('dd000006-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'panna-fresca',      'Panna fresca 500ml',         'PANNA-F',     'ml'),
  ('dd000007-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'cacao-amaro',       'Cacao amaro 500g',           'CAC-AM-500',  'g'),
  ('dd000008-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'lievito-birra',     'Lievito di birra fresco',    'LIEV-B',      'g'),
  ('dd000009-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'latte-intero',      'Latte intero 1lt',           'LATTE-I',     'ml'),
  ('dd000010-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'savoiardi-400',     'Savoiardi 400g',             'SAV-400',     'g');

-- Demo inventory stock
INSERT INTO inventory_stock (organization_id, product_id, qty, threshold)
VALUES
  ('bb000000-0000-0000-0000-000000000001', 'dd000001-0000-0000-0000-000000000001',  800, 2000),
  ('bb000000-0000-0000-0000-000000000001', 'dd000002-0000-0000-0000-000000000001', 2000, 4000),
  ('bb000000-0000-0000-0000-000000000001', 'dd000003-0000-0000-0000-000000000001',   24,   12),
  ('bb000000-0000-0000-0000-000000000001', 'dd000004-0000-0000-0000-000000000001', 3000, 1000),
  ('bb000000-0000-0000-0000-000000000001', 'dd000005-0000-0000-0000-000000000001',  200,  500),
  ('bb000000-0000-0000-0000-000000000001', 'dd000006-0000-0000-0000-000000000001', 1500,  500),
  ('bb000000-0000-0000-0000-000000000001', 'dd000007-0000-0000-0000-000000000001',  150,  300),
  ('bb000000-0000-0000-0000-000000000001', 'dd000008-0000-0000-0000-000000000001',  100,   50),
  ('bb000000-0000-0000-0000-000000000001', 'dd000009-0000-0000-0000-000000000001', 3000, 1000),
  ('bb000000-0000-0000-0000-000000000001', 'dd000010-0000-0000-0000-000000000001',  800,  400);
*/
