// =============================================================================
// lib/database.types.ts
// Tipi Supabase per il nuovo schema (migrations_v2).
// Aggiornare quando cambia lo schema SQL.
// Generazione automatica: npx supabase gen types typescript --local
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ── Enums ─────────────────────────────────────────────────────────────────────

export type UnitOfMeasure = 'g' | 'kg' | 'ml' | 'l' | 'pz' | 'bustina' | 'foglio';

export type MovementType =
  | 'purchase_receipt'
  | 'production_usage'
  | 'waste'
  | 'manual_adjustment'
  | 'initial_stock'
  | 'return_to_supplier';

export type OrderStatus = 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';

export type PlanStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export type OrgRole = 'owner' | 'baker' | 'viewer';

// ── marketplace enums (migrations 012–016) ────────────────────────────────────

export type AccountType = 'customer' | 'supplier';

export type ConnectionStatus = 'active' | 'revoked';

export type MarketplaceOrderStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'in_preparation'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

// ── Database type ─────────────────────────────────────────────────────────────
// NOTA: ogni tabella/vista richiede `Relationships` dal supabase-js v2.49+.

export interface Database {
  public: {
    Tables: {
      // ── identity ────────────────────────────────────────────────────────────
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          city: string | null;
          email: string | null;
          account_type: AccountType;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          city?: string | null;
          email?: string | null;
          account_type?: AccountType;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          city?: string | null;
          email?: string | null;
          account_type?: AccountType;
          updated_at?: string;
        };
        Relationships: [];
      };

      org_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrgRole;
          created_at?: string;
        };
        Update: {
          role?: OrgRole;
        };
        Relationships: [
          {
            foreignKeyName: 'org_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };

      // ── catalog ─────────────────────────────────────────────────────────────
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          email: string;
          phone: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          email: string;
          phone?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          email?: string;
          phone?: string | null;
          notes?: string | null;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'suppliers_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };

      ingredient_products: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string | null;
          name: string;
          sku: string | null;
          unit: UnitOfMeasure;
          unit_price: number | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          supplier_id?: string | null;
          name: string;
          sku?: string | null;
          unit: UnitOfMeasure;
          unit_price?: number | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          supplier_id?: string | null;
          name?: string;
          sku?: string | null;
          unit?: UnitOfMeasure;
          unit_price?: number | null;
          notes?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredient_products_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          }
        ];
      };

      recipes: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          category: string | null;
          emoji: string | null;
          base_portions: number;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          category?: string | null;
          emoji?: string | null;
          base_portions: number;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          category?: string | null;
          emoji?: string | null;
          base_portions?: number;
          notes?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };

      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          ingredient_product_id: string;
          quantity: number;
          unit: UnitOfMeasure;
          sort_order: number;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          ingredient_product_id: string;
          quantity: number;
          unit: UnitOfMeasure;
          sort_order?: number;
        };
        Update: {
          quantity?: number;
          unit?: UnitOfMeasure;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipe_ingredients_ingredient_product_id_fkey';
            columns: ['ingredient_product_id'];
            isOneToOne: false;
            referencedRelation: 'ingredient_products';
            referencedColumns: ['id'];
          }
        ];
      };

      // ── inventory ───────────────────────────────────────────────────────────
      inventory_movements: {
        Row: {
          id: string;
          organization_id: string;
          ingredient_product_id: string;
          movement_type: MovementType;
          quantity_delta: number;
          unit: UnitOfMeasure;
          reference_type: string | null;
          reference_id: string | null;
          notes: string | null;
          performed_by: string | null;
          performed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          ingredient_product_id: string;
          movement_type: MovementType;
          quantity_delta: number;
          unit: UnitOfMeasure;
          reference_type?: string | null;
          reference_id?: string | null;
          notes?: string | null;
          performed_by?: string | null;
          performed_at?: string;
          created_at?: string;
        };
        Update: never; // append-only
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_ingredient_product_id_fkey';
            columns: ['ingredient_product_id'];
            isOneToOne: false;
            referencedRelation: 'ingredient_products';
            referencedColumns: ['id'];
          }
        ];
      };

      inventory_levels: {
        Row: {
          id: string;
          organization_id: string;
          ingredient_product_id: string;
          current_quantity: number;
          unit: UnitOfMeasure;
          min_threshold: number;
          last_updated_at: string;
        };
        Insert: never; // solo via trigger SECURITY DEFINER
        Update: {
          min_threshold?: number; // unico campo aggiornabile dall'app
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_levels_ingredient_product_id_fkey';
            columns: ['ingredient_product_id'];
            isOneToOne: true;
            referencedRelation: 'ingredient_products';
            referencedColumns: ['id'];
          }
        ];
      };

      // ── production ──────────────────────────────────────────────────────────
      production_plans: {
        Row: {
          id: string;
          organization_id: string;
          plan_date: string; // YYYY-MM-DD
          status: PlanStatus;
          notes: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          plan_date: string;
          status?: PlanStatus;
          notes?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan_date?: string;
          status?: PlanStatus;
          notes?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      production_plan_items: {
        Row: {
          id: string;
          production_plan_id: string;
          recipe_id: string;
          batch_count: number;
          notes: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          production_plan_id: string;
          recipe_id: string;
          batch_count: number;
          notes?: string | null;
          sort_order?: number;
        };
        Update: {
          batch_count?: number;
          notes?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'production_plan_items_production_plan_id_fkey';
            columns: ['production_plan_id'];
            isOneToOne: false;
            referencedRelation: 'production_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'production_plan_items_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          }
        ];
      };

      // ── ordering ────────────────────────────────────────────────────────────
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string;
          status: OrderStatus;
          order_date: string;
          expected_date: string | null;
          notes: string | null;
          email_message_id: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          supplier_id: string;
          status?: OrderStatus;
          order_date?: string;
          expected_date?: string | null;
          notes?: string | null;
          email_message_id?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          supplier_id?: string;
          status?: OrderStatus;
          order_date?: string;
          expected_date?: string | null;
          notes?: string | null;
          email_message_id?: string | null;
          sent_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_orders_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          }
        ];
      };

      order_line_items: {
        Row: {
          id: string;
          purchase_order_id: string;
          ingredient_product_id: string;
          quantity_ordered: number;
          quantity_received: number | null;
          unit: UnitOfMeasure;
          unit_price_snapshot: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          ingredient_product_id: string;
          quantity_ordered: number;
          quantity_received?: number | null;
          unit: UnitOfMeasure;
          unit_price_snapshot?: number | null;
          notes?: string | null;
        };
        Update: {
          quantity_ordered?: number;
          quantity_received?: number | null;
          unit?: UnitOfMeasure;
          unit_price_snapshot?: number | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'order_line_items_purchase_order_id_fkey';
            columns: ['purchase_order_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['id'];
          }
        ];
      };

      order_status_history: {
        Row: {
          id: string;
          purchase_order_id: string;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          changed_by: string | null;
          notes: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          from_status?: OrderStatus | null;
          to_status: OrderStatus;
          changed_by?: string | null;
          notes?: string | null;
          changed_at?: string;
        };
        Update: never; // append-only
        Relationships: [
          {
            foreignKeyName: 'order_status_history_purchase_order_id_fkey';
            columns: ['purchase_order_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['id'];
          }
        ];
      };
    };

    Views: {
      v_ingredient_requirements: {
        Row: {
          production_plan_id: string;
          organization_id: string;
          plan_date: string;
          ingredient_product_id: string;
          ingredient_name: string;
          unit: UnitOfMeasure;
          total_required: number;
          current_stock: number;
          estimated_shortage: number;
          estimated_shortage_cost: number | null;
        };
        Relationships: [];
      };
      v_low_stock_alerts: {
        Row: {
          organization_id: string;
          ingredient_product_id: string;
          ingredient_name: string;
          supplier_name: string | null;
          current_quantity: number;
          min_threshold: number;
          unit: UnitOfMeasure;
          alert_level: 'out_of_stock' | 'critical' | 'low';
        };
        Relationships: [];
      };
      v_open_orders: {
        Row: {
          order_id: string;
          organization_id: string;
          status: OrderStatus;
          order_date: string;
          expected_date: string | null;
          total_amount: number | null;
          sent_at: string | null;
          supplier_id: string;
          supplier_name: string;
          line_items_count: number;
        };
        Relationships: [];
      };
      v_inventory_stock_full: {
        Row: {
          organization_id: string;
          ingredient_product_id: string;
          ingredient_name: string;
          supplier_name: string | null;
          unit: UnitOfMeasure;
          unit_price: number | null;
          current_quantity: number;
          min_threshold: number;
          stock_status: 'out_of_stock' | 'critical' | 'low' | 'ok';
          stock_value: number | null;
        };
        Relationships: [];
      };

      // ── marketplace (migrations 012–016) ─────────────────────────────────────
      supplier_connection_keys: {
        Row: {
          id: string;
          supplier_org_id: string;
          label: string | null;
          key_prefix: string;
          key_hash: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
        };
        Insert: {
          id?: string;
          supplier_org_id: string;
          label?: string | null;
          key_prefix: string;
          key_hash: string;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Update: {
          id?: string;
          supplier_org_id?: string;
          label?: string | null;
          key_prefix?: string;
          key_hash?: string;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Relationships: [];
      };

      supplier_customer_connections: {
        Row: {
          id: string;
          supplier_org_id: string;
          customer_org_id: string;
          connection_key_id: string | null;
          status: ConnectionStatus;
          created_by: string | null;
          created_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
        };
        Insert: {
          id?: string;
          supplier_org_id: string;
          customer_org_id: string;
          connection_key_id?: string | null;
          status?: ConnectionStatus;
          created_by?: string | null;
          created_at?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Update: {
          id?: string;
          supplier_org_id?: string;
          customer_org_id?: string;
          connection_key_id?: string | null;
          status?: ConnectionStatus;
          created_by?: string | null;
          created_at?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Relationships: [];
      };

      supplier_catalog_items: {
        Row: {
          id: string;
          supplier_org_id: string;
          name: string;
          sku: string | null;
          unit: UnitOfMeasure;
          unit_price: number | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          supplier_org_id: string;
          name: string;
          sku?: string | null;
          unit: UnitOfMeasure;
          unit_price?: number | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          supplier_org_id?: string;
          name?: string;
          sku?: string | null;
          unit?: UnitOfMeasure;
          unit_price?: number | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      marketplace_orders: {
        Row: {
          id: string;
          customer_org_id: string;
          supplier_org_id: string;
          connection_id: string;
          status: MarketplaceOrderStatus;
          notes: string | null;
          idempotency_key: string | null;
          created_by: string | null;
          submitted_at: string | null;
          accepted_at: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_org_id: string;
          supplier_org_id: string;
          connection_id: string;
          status?: MarketplaceOrderStatus;
          notes?: string | null;
          idempotency_key?: string | null;
          created_by?: string | null;
          submitted_at?: string | null;
          accepted_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_org_id?: string;
          supplier_org_id?: string;
          connection_id?: string;
          status?: MarketplaceOrderStatus;
          notes?: string | null;
          idempotency_key?: string | null;
          created_by?: string | null;
          submitted_at?: string | null;
          accepted_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      marketplace_order_lines: {
        Row: {
          id: string;
          order_id: string;
          catalog_item_id: string | null;
          name_snapshot: string;
          sku_snapshot: string | null;
          unit: UnitOfMeasure;
          quantity: number;
          unit_price_snapshot: number | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          catalog_item_id?: string | null;
          name_snapshot: string;
          sku_snapshot?: string | null;
          unit: UnitOfMeasure;
          quantity: number;
          unit_price_snapshot?: number | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          catalog_item_id?: string | null;
          name_snapshot?: string;
          sku_snapshot?: string | null;
          unit?: UnitOfMeasure;
          quantity?: number;
          unit_price_snapshot?: number | null;
          sort_order?: number;
        };
        Relationships: [];
      };

      marketplace_order_status_history: {
        Row: {
          id: string;
          order_id: string;
          from_status: MarketplaceOrderStatus | null;
          to_status: MarketplaceOrderStatus;
          changed_by: string | null;
          changed_by_org_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: MarketplaceOrderStatus | null;
          to_status: MarketplaceOrderStatus;
          changed_by?: string | null;
          changed_by_org_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          from_status?: MarketplaceOrderStatus | null;
          to_status?: MarketplaceOrderStatus;
          changed_by?: string | null;
          changed_by_org_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      audit_logs: {
        Row: {
          id: string;
          org_id: string;
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          actor_user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };

    Functions: {
      current_organization_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      is_org_owner: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      receive_purchase_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      complete_production_plan: {
        Args: { p_plan_id: string };
        Returns: undefined;
      };
      create_organization: {
        Args: {
          p_name: string;
          p_slug: string;
          p_city?: string | null;
          p_email?: string | null;
          p_account_type?: AccountType;
        };
        Returns: {
          organization_id: string;
          member_id: string;
        }[];
      };
      current_account_type: {
        Args: Record<never, never>;
        Returns: AccountType;
      };
      assert_org_is_supplier: {
        Args: { p_org_id: string };
        Returns: undefined;
      };
      connect_supplier_by_key_hash: {
        Args: { p_key_hash: string };
        Returns: string;
      };
      marketplace_order_actor_for_transition: {
        Args: { p_from: MarketplaceOrderStatus; p_to: MarketplaceOrderStatus };
        Returns: AccountType;
      };
    };

    Enums: {
      unit_of_measure: UnitOfMeasure;
      movement_type: MovementType;
      order_status: OrderStatus;
      plan_status: PlanStatus;
      org_role: OrgRole;
      account_type: AccountType;
      connection_status: ConnectionStatus;
      marketplace_order_status: MarketplaceOrderStatus;
    };

    CompositeTypes: Record<never, never>;
  };
}
