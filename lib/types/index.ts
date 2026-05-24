// ─────────────────────────────────────────────────────────────────────────────
// PasticceriaOS — Domain Types
// Entity names from entity-list-1.md; extended for supplier workspace.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────────────────────

export type AccountType = "cliente" | "fornitore";

export type ClientRole =
  | "titolare"
  | "responsabile_laboratorio"
  | "operatore";

export type SupplierRole =
  | "supplier_owner"
  | "supplier_manager"
  | "supplier_operator";

/** 4-step lifecycle visible to the client (from user-flows-1.md Flow 7) */
export type OrderStatus =
  | "in_attesa"
  | "inviato"
  | "in_consegna"
  | "consegnato";

/** Internal supplier lifecycle — maps onto client status */
export type SupplierOrderStatus =
  | "ricevuto"     // → in_attesa
  | "accettato"    // → inviato
  | "in_preparazione" // → inviato
  | "spedito"      // → in_consegna
  | "completato";  // → consegnato

export type StockStatus = "ok" | "warn" | "danger";

export type IngredientUnit = "g" | "kg" | "ml" | "lt" | "pz" | "bustina" | "conf";

export type RecipeCategory =
  | "Lievitati"
  | "Torte"
  | "Monoporzioni"
  | "Biscotti"
  | "Semifreddi";

export type LinkStatus = "active" | "pending" | "suspended";

// ── Auth / Identity ──────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  account_type: AccountType;
  created_at: string;
  updated_at: string;
}

// ── Cliente Workspace ─────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  city: string | null;
  email: string | null;
  supplier_id: string | null;
  subscription_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: ClientRole;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price_eur: number;
  max_recipes: number;
  auto_order: boolean;
  advanced_analytics: boolean;
  ai_prediction: boolean;
  max_suppliers: number;
  api_integration: boolean;
  multi_location: boolean;
}

export interface OrganizationSettings {
  organization_id: string;
  order_advance_days: number;
  auto_order_enabled: boolean;
  order_send_method: string;
  updated_at: string;
}

// ── Supplier Workspace ────────────────────────────────────────────────────────

export interface SupplierAccount {
  id: string;
  company_name: string;
  owner_id: string;
  email: string | null;
  city: string | null;
  order_email: string | null;
  order_method: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierMembership {
  id: string;
  supplier_id: string;
  user_id: string;
  role: SupplierRole;
  created_at: string;
}

export interface SupplierCustomerLink {
  id: string;
  supplier_id: string;
  organization_id: string;
  status: LinkStatus;
  linked_at: string;
}

export interface SupplierProductCatalog {
  id: string;
  supplier_id: string;
  name: string;
  sku: string | null;
  unit: IngredientUnit;
  base_price: number | null;
  available: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierPriceList {
  id: string;
  supplier_id: string;
  organization_id: string | null; // null = default for all clients
  catalog_product_id: string;
  price: number;
  valid_from: string;
  valid_to: string | null;
}

export interface SupplierOrderStatusHistory {
  id: string;
  order_id: string;
  old_status: SupplierOrderStatus | null;
  new_status: SupplierOrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

// ── Inventory / Recipes ───────────────────────────────────────────────────────

export interface IngredientProduct {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  sku: string | null;
  unit: IngredientUnit;
  created_at: string;
}

export interface InventoryStock {
  id: string;
  organization_id: string;
  product_id: string;
  qty: number;
  threshold: number;
  status: StockStatus; // computed by DB
  updated_at: string;
}

export interface Recipe {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  emoji: string;
  portions: number;
  category: RecipeCategory | null;
  food_cost_per_portion: number | null;
  margin_percentage: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  product_id: string;
  qty: number;
  unit: IngredientUnit;
}

// ── Production ────────────────────────────────────────────────────────────────

export interface ProductionPlan {
  id: string;
  organization_id: string;
  plan_date: string;
  created_by: string | null;
  created_at: string;
}

export interface ProductionPlanItem {
  id: string;
  plan_id: string;
  recipe_id: string;
  target_qty: number;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  organization_id: string;
  supplier_id: string;
  order_number: string;
  status: OrderStatus;
  supplier_status: SupplierOrderStatus | null;
  total_amount: number | null;
  supplier_notes: string | null;
  client_notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLineItem {
  id: string;
  order_id: string;
  product_id: string;
  supplier_sku: string | null;
  quantity: number;
  unit: IngredientUnit;
  unit_price: number | null;
  line_total: number | null;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  organization_id: string | null;
  supplier_id: string | null;
  user_id: string | null;
  type: string;
  title: string;
  message: string | null;
  severity: "info" | "warning" | "error" | "success";
  read_at: string | null;
  created_at: string;
}

// ── View / Composite Types (used in UI) ───────────────────────────────────────

/** Supplier sees orders with client info */
export interface SupplierOrderView extends PurchaseOrder {
  organization_name: string;
  organization_city: string | null;
  line_items: (OrderLineItem & { product_name: string })[];
}

/** Client sees orders with supplier info */
export interface ClientOrderView extends PurchaseOrder {
  supplier_name: string;
  line_items: (OrderLineItem & { product_name: string })[];
}

/** Ingredient calculation result (non-persisted, computed on demand) */
export interface IngredientRequirement {
  product_id: string;
  product_name: string;
  needed: number;
  available: number;
  unit: IngredientUnit;
  status: StockStatus;
  deficit: number;
}

/** Supplier's view of a connected client */
export interface LinkedClientView {
  organization_id: string;
  name: string;
  city: string | null;
  link_status: LinkStatus;
  linked_at: string;
  last_order_date: string | null;
  order_count: number;
  total_volume: number;
}
