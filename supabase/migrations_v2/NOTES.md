# Note critiche — migrations_v2

## Decisioni prese

### 1. `min_threshold` in `inventory_levels`, non in `ingredient_products`
È una soglia operativa di stock management, non un attributo del prodotto. Collocarla in `ingredient_products` accoppia catalogo e operazioni. In `inventory_levels` ha già il contesto (org, prodotto, livello corrente) e si presta a differenziazione multi-location futura senza modifiche di schema.

### 2. `email_message_id` — UNIQUE senza indice parziale
In PostgreSQL, i NULL in colonne UNIQUE sono sempre distinti tra loro, quindi `UNIQUE(email_message_id)` consente N righe con NULL. Non serve un indice parziale `WHERE email_message_id IS NOT NULL`. Il comportamento è corretto per idempotenza: l'app controlla `WHERE email_message_id IS NOT NULL` nel service layer.

### 3. `current_organization_id()` — SECURITY DEFINER e ricorsione
La funzione usa SECURITY DEFINER per evitare ricorsione: la policy di `org_members` chiamerebbe `current_organization_id()` che legge `org_members`, loop infinito. SECURITY DEFINER bypassa RLS sulla propria lettura. Rischio: se la funzione ha un bug, legge dati fuori dall'isolamento tenant. Mitigation: `SET search_path = public` obbligatorio.

### 4. `inventory_levels` — nessuna policy INSERT per l'app
Solo il trigger `trg_inventory_movement_after_insert` (SECURITY DEFINER) può creare/aggiornare `current_quantity`. L'app non ha policy INSERT su questa tabella. La policy UPDATE consente all'app di aggiornare `min_threshold` — la limitazione a soli `min_threshold` è enforced nel service layer TypeScript, non in RLS (PostgreSQL non permette column-level RLS policies).

### 5. Check constraint segno movimenti in `inventory_movements`
`purchase_receipt` e `initial_stock` sono forzatamente positivi. `production_usage`, `waste`, `return_to_supplier` sono forzatamente negativi. `manual_adjustment` può essere entrambi. Questo evita errori silenziosi (es. registrare una ricezione con delta negativo).

### 6. Note obbligatorie su `manual_adjustment`
Il check `inventory_movements_manual_notes` forza `notes IS NOT NULL AND length > 0` per i movimenti manuali. Auditability non negoziabile: ogni correzione manuale deve avere una giustificazione leggibile.

### 7. `v_ingredient_requirements` — nessuna conversione unità
MVP: assume che l'unità in `recipe_ingredients` sia la stessa in `inventory_levels` per lo stesso prodotto. L'app deve validare questo vincolo alla creazione di `recipe_ingredients` (unit coerente con `ingredient_products.unit`). Conversioni g↔kg, ml↔l sono MVP+1.

### 8. `production_plan_items` INSERT policy — solo su piani draft
Non si possono aggiungere righe a piani in stato `in_progress` o `completed`. Enforced sia nella RLS INSERT policy che nel service layer.

### 9. `order_line_items` UPDATE/DELETE — solo su ordini draft
Una volta inviato l'ordine (`status = 'sent'`), le righe sono immutabili a livello RLS. Questo protegge l'integrità dello snapshot prezzi post-invio.

### 10. `organizations` — nessuna policy INSERT
La creazione di una nuova organizzazione avviene in un server action con `service_role` (onboarding). Un utente non crea mai una org direttamente dal client con il suo JWT. Questo è intenzionale e sicuro.

## Ordine di esecuzione obbligatorio
```
001_enums.sql         -- enum devono esistere prima delle tabelle che li usano
002_identity.sql      -- organizations/org_members + set_updated_at trigger function
003_catalog.sql       -- suppliers/ingredient_products (dipendono da organizations)
004_recipes.sql       -- recipes/recipe_ingredients (dipendono da ingredient_products)
005_inventory.sql     -- movements/levels + trigger (dipendono da ingredient_products)
006_production.sql    -- production_plans/items (dipendono da recipes)
007_ordering.sql      -- purchase_orders/lines/history (dipendono da suppliers, ingredient_products)
008_views.sql         -- viste (dipendono da tutte le tabelle precedenti)
009_rls.sql           -- RLS + helper functions (dipendono da tutte le tabelle)
010_indexes.sql       -- indici (dipendono da tutte le tabelle)
```

## Cosa manca per andare in produzione
1. **Onboarding RPC**: una function `create_organization(name, slug, user_id)` con SECURITY DEFINER che inserisce in `organizations` e `org_members` atomicamente. Senza questa, il signup non funziona senza service_role.
2. **Seed dati test**: script SQL separato per popolare dati demo in un tenant di test.
3. **Supabase Vault / secrets**: le credenziali email provider (Resend API key) vanno in Supabase Vault, non in variabili d'ambiente esposte al client.
4. **Backup policy**: configurare PITR (Point-in-Time Recovery) in Supabase prima di andare in prod.
