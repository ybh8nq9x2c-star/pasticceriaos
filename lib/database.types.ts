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
  | 'return_to_supplier'
  | 'sale_deduction'
  | 'sale_reversal';

export type OrderStatus = 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';

export type PlanStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export type OrgRole = 'owner' | 'baker' | 'viewer';

// ── goods receipts (migration 035) ───────────────────────────────────────────

export type ReceiptMode = 'supplier' | 'bakery';

export type ReceiptStatus =
  | 'draft'
  | 'expected'
  | 'partial'
  | 'completed'
  | 'discrepancy'
  | 'cancelled';

export type ReceiptLineStatus =
  | 'pending'
  | 'matched'
  | 'received'
  | 'partial'
  | 'discrepancy';

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

// ── documenti commerciali (migration 027) ─────────────────────────────────────

export type DocumentType = 'order_confirmation' | 'delivery_note' | 'invoice' | 'credit_note';

export type DocumentStatus = 'received' | 'matched' | 'anomaly' | 'archived';

export type AnomalyType =
  | 'quantity_mismatch'
  | 'price_mismatch'
  | 'extra_item'
  | 'missing_item'
  | 'total_mismatch';

// ── ordini clienti (migration 029) ────────────────────────────────────────────

export type CustomerOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in_production'
  | 'ready'
  | 'delivered'
  | 'cancelled';

// ── vendite / deduzione magazzino al momento vendita (migrations 041–042) ─────

export type SaleStatus = 'processed' | 'partially_linked' | 'unlinked' | 'reversed' | 'void';

export type SaleLineStatus = 'deducted' | 'unlinked' | 'no_bom' | 'unit_mismatch';

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
          vat_number: string | null;
          vat_country: string;
          legal_name: string | null;
          legal_form: string | null;
          fiscal_data_source: string | null;
          vat_validated_at: string | null;
          billing_eligible: boolean;
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
          vat_number?: string | null;
          vat_country?: string;
          legal_name?: string | null;
          legal_form?: string | null;
          fiscal_data_source?: string | null;
          vat_validated_at?: string | null;
          billing_eligible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          city?: string | null;
          email?: string | null;
          account_type?: AccountType;
          vat_number?: string | null;
          vat_country?: string;
          legal_name?: string | null;
          legal_form?: string | null;
          fiscal_data_source?: string | null;
          vat_validated_at?: string | null;
          billing_eligible?: boolean;
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
          supplier_org_id: string | null;
          portal_token_version: number;
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
          supplier_org_id?: string | null;
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
          supplier_org_id?: string | null;
          portal_token_version?: number;
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
          barcode: string | null;
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
          barcode?: string | null;
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
          barcode?: string | null;
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
          sell_price_per_portion: number | null;
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
          sell_price_per_portion?: number | null;
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
          sell_price_per_portion?: number | null;
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
          qty_before: number | null;
          qty_after: number | null;
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
          qty_before?: number | null;
          qty_after?: number | null;
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
          total_amount: number | null;
          email_message_id: string | null;
          marketplace_order_id: string | null;
          sent_at: string | null;
          created_by: string | null;
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
          total_amount?: number | null;
          email_message_id?: string | null;
          marketplace_order_id?: string | null;
          sent_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          supplier_id?: string;
          status?: OrderStatus;
          order_date?: string;
          expected_date?: string | null;
          notes?: string | null;
          total_amount?: number | null;
          email_message_id?: string | null;
          marketplace_order_id?: string | null;
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
      // ── supplier price list (migration 026) ──────────────────────────────────
      supplier_price_list: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string;
          ingredient_product_id: string;
          unit_price: number;
          unit: UnitOfMeasure;
          valid_from: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          supplier_id: string;
          ingredient_product_id: string;
          unit_price: number;
          unit: UnitOfMeasure;
          valid_from?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          unit_price?: number;
          unit?: UnitOfMeasure;
          valid_from?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };

      // ── documenti commerciali (migration 027) ────────────────────────────────
      commercial_documents: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string | null;
          purchase_order_id: string | null;
          marketplace_order_id: string | null;
          document_type: DocumentType;
          document_status: DocumentStatus;
          document_number: string | null;
          document_date: string;
          due_date: string | null;
          subtotal_amount: number | null;
          tax_amount: number | null;
          total_amount: number | null;
          notes: string | null;
          file_url: string | null;
          storage_path: string | null;
          uploaded_by_org_id: string | null;
          matched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          supplier_id?: string | null;
          purchase_order_id?: string | null;
          marketplace_order_id?: string | null;
          document_type: DocumentType;
          document_status?: DocumentStatus;
          document_number?: string | null;
          document_date: string;
          due_date?: string | null;
          subtotal_amount?: number | null;
          tax_amount?: number | null;
          total_amount?: number | null;
          notes?: string | null;
          file_url?: string | null;
          storage_path?: string | null;
          uploaded_by_org_id?: string | null;
          matched_at?: string | null;
        };
        Update: {
          supplier_id?: string | null;
          purchase_order_id?: string | null;
          document_status?: DocumentStatus;
          document_number?: string | null;
          document_date?: string;
          due_date?: string | null;
          subtotal_amount?: number | null;
          tax_amount?: number | null;
          total_amount?: number | null;
          notes?: string | null;
          file_url?: string | null;
          storage_path?: string | null;
          matched_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'commercial_documents_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          }
        ];
      };

      document_line_items: {
        Row: {
          id: string;
          document_id: string;
          order_line_item_id: string | null;
          ingredient_product_id: string | null;
          description: string;
          quantity: number;
          unit: UnitOfMeasure;
          unit_price: number | null;
          line_total: number | null;
          quantity_variance: number | null;
          price_variance: number | null;
          matched_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          order_line_item_id?: string | null;
          ingredient_product_id?: string | null;
          description: string;
          quantity: number;
          unit: UnitOfMeasure;
          unit_price?: number | null;
          line_total?: number | null;
          quantity_variance?: number | null;
          price_variance?: number | null;
          matched_at?: string | null;
        };
        Update: {
          order_line_item_id?: string | null;
          ingredient_product_id?: string | null;
          quantity_variance?: number | null;
          price_variance?: number | null;
          matched_at?: string | null;
        };
        Relationships: [];
      };

      document_anomalies: {
        Row: {
          id: string;
          document_id: string;
          anomaly_type: AnomalyType;
          description: string;
          expected_value: string | null;
          actual_value: string | null;
          resolved: boolean;
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          anomaly_type: AnomalyType;
          description: string;
          expected_value?: string | null;
          actual_value?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [];
      };

      // ── lotti ingredienti (migration 028) ────────────────────────────────────
      ingredient_batches: {
        Row: {
          id: string;
          organization_id: string;
          ingredient_product_id: string;
          purchase_order_id: string | null;
          supplier_id: string | null;
          lot_number: string | null;
          expiry_date: string;
          quantity_received: number;
          quantity_remaining: number;
          unit: UnitOfMeasure;
          received_at: string;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          receipt_line_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          ingredient_product_id: string;
          purchase_order_id?: string | null;
          supplier_id?: string | null;
          lot_number?: string | null;
          expiry_date: string;
          quantity_received: number;
          quantity_remaining: number;
          unit: UnitOfMeasure;
          received_at?: string;
          notes?: string | null;
          is_active?: boolean;
          receipt_line_id?: string | null;
        };
        Update: {
          lot_number?: string | null;
          expiry_date?: string;
          quantity_remaining?: number;
          notes?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };

      // ── goods receipts (migration 035) ───────────────────────────────────────
      purchase_receipts: {
        Row: {
          id: string;
          organization_id: string;
          mode: ReceiptMode;
          supplier_id: string | null;
          purchase_order_id: string | null;
          source_document_id: string | null;
          ddt_number: string | null;
          ddt_date: string | null;
          status: ReceiptStatus;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          mode: ReceiptMode;
          supplier_id?: string | null;
          purchase_order_id?: string | null;
          source_document_id?: string | null;
          ddt_number?: string | null;
          ddt_date?: string | null;
          status?: ReceiptStatus;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          supplier_id?: string | null;
          purchase_order_id?: string | null;
          source_document_id?: string | null;
          ddt_number?: string | null;
          ddt_date?: string | null;
          status?: ReceiptStatus;
          notes?: string | null;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };

      purchase_receipt_lines: {
        Row: {
          id: string;
          receipt_id: string;
          product_id: string | null;
          raw_product_name: string;
          sku: string | null;
          barcode: string | null;
          qty_expected: number | null;
          qty_received: number;
          qty_posted: number;
          unit: UnitOfMeasure;
          lot_number: string | null;
          expiry_date: string | null;
          discrepancy_reason: string | null;
          line_status: ReceiptLineStatus;
          sort_order: number;
          scanned_by: string | null;
          scanned_at: string | null;
          created_at: string;
          gtin: string | null;
          sscc: string | null;
          case_quantity: number | null;
          production_date: string | null;
          gs1_raw: string | null;
          gs1_ai: Record<string, string> | null;
        };
        Insert: {
          id?: string;
          receipt_id: string;
          product_id?: string | null;
          raw_product_name: string;
          sku?: string | null;
          barcode?: string | null;
          qty_expected?: number | null;
          qty_received?: number;
          qty_posted?: number;
          unit?: UnitOfMeasure;
          lot_number?: string | null;
          expiry_date?: string | null;
          discrepancy_reason?: string | null;
          line_status?: ReceiptLineStatus;
          sort_order?: number;
          scanned_by?: string | null;
          scanned_at?: string | null;
          created_at?: string;
          gtin?: string | null;
          sscc?: string | null;
          case_quantity?: number | null;
          production_date?: string | null;
          gs1_raw?: string | null;
          gs1_ai?: Record<string, string> | null;
        };
        Update: {
          product_id?: string | null;
          raw_product_name?: string;
          sku?: string | null;
          barcode?: string | null;
          qty_expected?: number | null;
          qty_received?: number;
          qty_posted?: number;
          unit?: UnitOfMeasure;
          lot_number?: string | null;
          expiry_date?: string | null;
          discrepancy_reason?: string | null;
          line_status?: ReceiptLineStatus;
          sort_order?: number;
          scanned_by?: string | null;
          scanned_at?: string | null;
          gtin?: string | null;
          sscc?: string | null;
          case_quantity?: number | null;
          production_date?: string | null;
          gs1_raw?: string | null;
          gs1_ai?: Record<string, string> | null;
        };
        Relationships: [];
      };

      production_batch_ingredients: {
        Row: {
          id: string;
          organization_id: string;
          production_plan_id: string;
          ingredient_batch_id: string;
          ingredient_product_id: string;
          quantity_used: number;
          unit: UnitOfMeasure;
          used_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      // ── notifiche di sistema (migration 032) ─────────────────────────────────
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          type: 'info' | 'warn' | 'error';
          title: string;
          message: string | null;
          href: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          type?: 'info' | 'warn' | 'error';
          title: string;
          message?: string | null;
          href?: string | null;
          read?: boolean;
        };
        Update: {
          read?: boolean;
        };
        Relationships: [];
      };

      // ── ordini clienti (migration 029) ───────────────────────────────────────
      customer_orders: {
        Row: {
          id: string;
          organization_id: string;
          customer_name: string;
          customer_phone: string | null;
          customer_email: string | null;
          pickup_date: string;
          pickup_time: string | null;
          notes: string | null;
          status: CustomerOrderStatus;
          total_amount: number | null;
          deposit_paid: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_name: string;
          customer_phone?: string | null;
          customer_email?: string | null;
          pickup_date: string;
          pickup_time?: string | null;
          notes?: string | null;
          status?: CustomerOrderStatus;
          total_amount?: number | null;
          deposit_paid?: number | null;
          created_by?: string | null;
        };
        Update: {
          customer_name?: string;
          customer_phone?: string | null;
          customer_email?: string | null;
          pickup_date?: string;
          pickup_time?: string | null;
          notes?: string | null;
          status?: CustomerOrderStatus;
          total_amount?: number | null;
          deposit_paid?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_orders_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };

      customer_order_items: {
        Row: {
          id: string;
          customer_order_id: string;
          recipe_id: string | null;
          description: string;
          quantity: number;
          unit_price: number | null;
          notes: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          customer_order_id: string;
          recipe_id?: string | null;
          description: string;
          quantity: number;
          unit_price?: number | null;
          notes?: string | null;
          sort_order?: number;
        };
        Update: {
          recipe_id?: string | null;
          description?: string;
          quantity?: number;
          unit_price?: number | null;
          notes?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_order_items_customer_order_id_fkey';
            columns: ['customer_order_id'];
            isOneToOne: false;
            referencedRelation: 'customer_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_order_items_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          }
        ];
      };

      sales: {
        Row: {
          id: string;
          organization_id: string;
          external_sale_id: string;
          source: string;
          sold_at: string;
          status: SaleStatus;
          total_amount: number | null;
          customer_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          external_sale_id: string;
          source: string;
          sold_at: string;
          status?: SaleStatus;
          total_amount?: number | null;
          customer_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: {
          status?: SaleStatus;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };

      sale_lines: {
        Row: {
          id: string;
          sale_id: string;
          organization_id: string;
          external_line_id: string | null;
          external_product_ref: string;
          product_name_snapshot: string;
          recipe_id: string | null;
          quantity: number;
          unit_price: number | null;
          status: SaleLineStatus;
          exception: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          sale_id: string;
          organization_id: string;
          external_line_id?: string | null;
          external_product_ref: string;
          product_name_snapshot: string;
          recipe_id?: string | null;
          quantity: number;
          unit_price?: number | null;
          status?: SaleLineStatus;
          exception?: string | null;
          sort_order?: number;
        };
        Update: {
          recipe_id?: string | null;
          status?: SaleLineStatus;
          exception?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_lines_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_lines_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          }
        ];
      };

      product_mappings: {
        Row: {
          id: string;
          organization_id: string;
          source: string;
          external_product_ref: string;
          recipe_id: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source: string;
          external_product_ref: string;
          recipe_id: string;
          created_by?: string | null;
        };
        Update: {
          recipe_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_mappings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_mappings_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
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
          plan_status: PlanStatus;
          ingredient_product_id: string;
          ingredient_name: string;
          ingredient_sku: string | null;
          unit: UnitOfMeasure;
          total_required: number;
          current_stock: number;
          estimated_shortage: number;
          current_unit_price: number | null;
          estimated_shortage_cost: number | null;
          supplier_id: string | null;
          supplier_name: string | null;
          supplier_email: string | null;
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
          supplier_email: string | null;
          line_items_count: number;
        };
        Relationships: [];
      };
      v_recipe_costs: {
        Row: {
          recipe_id: string;
          organization_id: string;
          name: string;
          emoji: string | null;
          category: string | null;
          base_portions: number;
          sell_price_per_portion: number | null;
          is_active: boolean;
          ingredient_count: number;
          priced_ingredient_count: number;
          batch_cost: number | null;
          cost_per_portion: number | null;
          margin_pct: number | null;
        };
        Relationships: [];
      };
      v_recipe_cost_breakdown: {
        Row: {
          organization_id: string;
          recipe_id: string;
          recipe_ingredient_id: string;
          ingredient_product_id: string;
          ingredient_name: string;
          quantity: number;
          unit: UnitOfMeasure;
          price_unit: UnitOfMeasure;
          unit_price: number | null;
          line_cost: number | null;
          sort_order: number;
        };
        Relationships: [];
      };
      v_received_order_lines: {
        Row: {
          organization_id: string;
          purchase_order_id: string;
          supplier_id: string;
          received_at: string;
          ingredient_product_id: string;
          quantity_ordered: number;
          unit: UnitOfMeasure;
          unit_price_snapshot: number | null;
          line_total: number;
        };
        Relationships: [];
      };
      v_monthly_purchase_spend: {
        Row: {
          organization_id: string;
          month: string;
          orders_received: number;
          total_spend: number;
        };
        Relationships: [];
      };
      v_ingredient_purchase_stats: {
        Row: {
          organization_id: string;
          ingredient_product_id: string;
          ingredient_name: string;
          unit: UnitOfMeasure;
          orders_count: number;
          total_quantity: number;
          total_spend: number;
          first_price: number | null;
          last_price: number | null;
          last_received_at: string | null;
        };
        Relationships: [];
      };
      v_marketplace_order_facts: {
        Row: {
          order_id: string;
          supplier_org_id: string;
          customer_org_id: string;
          supplier_name: string | null;
          customer_name: string | null;
          status: MarketplaceOrderStatus;
          created_at: string;
          submitted_at: string | null;
          accepted_at: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          cancelled_at: string | null;
          line_count: number;
          total_value: number;
        };
        Relationships: [];
      };
      v_supplier_monthly_sales: {
        Row: {
          supplier_org_id: string;
          month: string;
          orders_count: number;
          total_value: number;
          customers_count: number;
        };
        Relationships: [];
      };
      v_supplier_product_sales: {
        Row: {
          supplier_org_id: string;
          catalog_item_id: string | null;
          name_snapshot: string;
          unit: UnitOfMeasure;
          orders_count: number;
          total_quantity: number;
          total_revenue: number;
          customers_count: number;
          last_ordered_at: string | null;
        };
        Relationships: [];
      };
      v_supplier_customer_stats: {
        Row: {
          supplier_org_id: string;
          customer_org_id: string;
          customer_name: string | null;
          orders_count: number;
          total_value: number | null;
          delivered_count: number;
          last_order_at: string | null;
        };
        Relationships: [];
      };
      v_documents_attention: {
        Row: {
          id: string;
          organization_id: string;
          document_type: DocumentType;
          document_status: DocumentStatus;
          document_number: string | null;
          document_date: string;
          total_amount: number | null;
          supplier_name: string | null;
          open_anomalies: number;
        };
        Relationships: [];
      };
      v_expiring_batches: {
        Row: {
          batch_id: string;
          organization_id: string;
          ingredient_product_id: string;
          ingredient_name: string;
          lot_number: string | null;
          expiry_date: string;
          quantity_remaining: number;
          unit: UnitOfMeasure;
          days_to_expiry: number;
          supplier_name: string | null;
          suggested_recipes: string[] | null;
        };
        Relationships: [];
      };
      v_customer_orders_upcoming: {
        Row: {
          order_id: string;
          organization_id: string;
          customer_name: string;
          pickup_date: string;
          pickup_time: string | null;
          status: CustomerOrderStatus;
          total_amount: number | null;
          items_count: number;
          pieces_count: number;
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
          last_updated_at: string;
          stock_status: 'out_of_stock' | 'critical' | 'low' | 'ok';
          deficit: number;
          supplier_id: string | null;
          supplier_email: string | null;
          is_active: boolean;
          sku: string | null;
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
      complete_purchase_receipt: {
        Args: { p_receipt_id: string };
        Returns: ReceiptStatus;
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
      receive_marketplace_order: {
        Args: { p_order_id: string };
        Returns: string;
      };
      unit_conversion_factor: {
        Args: { p_from: UnitOfMeasure; p_to: UnitOfMeasure };
        Returns: number | null;
      };
      ingest_sale: {
        Args: { p_payload: Json };
        Returns: string;
      };
      reverse_sale: {
        Args: { p_sale_id: string };
        Returns: string;
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
      receipt_mode: ReceiptMode;
      receipt_status: ReceiptStatus;
      receipt_line_status: ReceiptLineStatus;
      sale_status: SaleStatus;
      sale_line_status: SaleLineStatus;
    };

    CompositeTypes: Record<never, never>;
  };
}
