// ─── Supabase Database Types ──────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      warehouses: {
        Row: {
          warehouse_id: string;
          name: string;
          spreadsheet_id: string | null;
          drive_folder_id: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          warehouse_id?: string;
          name: string;
          spreadsheet_id?: string | null;
          drive_folder_id?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          warehouse_id?: string;
          name?: string;
          spreadsheet_id?: string | null;
          drive_folder_id?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_users: {
        Row: {
          user_id: string;
          warehouse_id: string;
          name: string;
          email: string;
          role: string;
          invite_status: "pending" | "accepted";
          invited_at: string | null;
          last_seen_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          warehouse_id: string;
          name: string;
          email: string;
          role: string;
          invite_status?: "pending" | "accepted";
          invited_at?: string | null;
          last_seen_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          warehouse_id?: string;
          name?: string;
          email?: string;
          role?: string;
          invite_status?: "pending" | "accepted";
          invited_at?: string | null;
          last_seen_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_users_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["warehouse_id"];
          },
        ];
      };
      parties: {
        Row: {
          party_id: string;
          warehouse_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          party_id?: string;
          warehouse_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          party_id?: string;
          warehouse_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parties_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["warehouse_id"];
          },
        ];
      };
      items: {
        Row: {
          item_id: string;
          warehouse_id: string;
          name: string;
          bag_size: number;
          unit: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          item_id?: string;
          warehouse_id: string;
          name: string;
          bag_size: number;
          unit?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          item_id?: string;
          warehouse_id?: string;
          name?: string;
          bag_size?: number;
          unit?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["warehouse_id"];
          },
        ];
      };
      delivery_orders: {
        Row: {
          do_id: string;
          warehouse_id: string;
          user_id: string;
          party_id: string | null;
          do_number: string;
          direction: string;
          date: string;
          item_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          do_id?: string;
          warehouse_id: string;
          user_id: string;
          party_id?: string | null;
          do_number: string;
          direction: string;
          date: string;
          item_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          do_id?: string;
          warehouse_id?: string;
          user_id?: string;
          party_id?: string | null;
          do_number?: string;
          direction?: string;
          date?: string;
          item_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_orders_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["warehouse_id"];
          },
          {
            foreignKeyName: "delivery_orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "delivery_orders_party_id_fkey";
            columns: ["party_id"];
            isOneToOne: false;
            referencedRelation: "parties";
            referencedColumns: ["party_id"];
          },
        ];
      };
      do_items: {
        Row: {
          do_item_id: string;
          do_id: string;
          item_id: string;
          sequence_num: number;
          bags: number;
          total_weight: number;
          bag_size: number;
          unit: string;
          total_quantity: number;
          vehicle_number: string | null;
          created_at: string;
        };
        Insert: {
          do_item_id?: string;
          do_id: string;
          item_id: string;
          sequence_num: number;
          bags: number;
          total_weight: number;
          bag_size: number;
          unit?: string;
          total_quantity?: number;
          vehicle_number?: string | null;
          created_at?: string;
        };
        Update: {
          do_item_id?: string;
          do_id?: string;
          item_id?: string;
          sequence_num?: number;
          bags?: number;
          total_weight?: number;
          bag_size?: number;
          unit?: string;
          total_quantity?: number;
          vehicle_number?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "do_items_do_id_fkey";
            columns: ["do_id"];
            isOneToOne: false;
            referencedRelation: "delivery_orders";
            referencedColumns: ["do_id"];
          },
          {
            foreignKeyName: "do_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["item_id"];
          },
        ];
      };
      audit_log: {
        Row: {
          log_id: number;
          warehouse_id: string;
          user_id: string | null;
          actor_name: string | null;
          entity: string;
          entity_id: string | null;
          action: string;
          old_data: Record<string, unknown> | null;
          new_data: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          session_id: string | null;
          request_id: string | null;
          previous_hash: string | null;
          current_hash: string | null;
          timestamp: string;
        };
        Insert: {
          log_id?: never;
          warehouse_id: string;
          user_id?: string | null;
          actor_name?: string | null;
          entity: string;
          entity_id?: string | null;
          action: string;
          old_data?: Record<string, unknown> | null;
          new_data?: Record<string, unknown> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          session_id?: string | null;
          request_id?: string | null;
          previous_hash?: string | null;
          current_hash?: string | null;
          timestamp?: string;
        };
        Update: {
          log_id?: never;
          warehouse_id?: string;
          user_id?: string | null;
          actor_name?: string | null;
          entity?: string;
          entity_id?: string | null;
          action?: string;
          old_data?: Record<string, unknown> | null;
          new_data?: Record<string, unknown> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          session_id?: string | null;
          request_id?: string | null;
          previous_hash?: string | null;
          current_hash?: string | null;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["warehouse_id"];
          },
          {
            foreignKeyName: "audit_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      files: {
        Row: {
          file_id: string;
          warehouse_id: string;
          user_id: string | null;
          do_id: string | null;
          file_name: string;
          file_type: string;
          file_size: number;
          drive_file_id: string;
          drive_url: string;
          folder_path: string;
          category: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          file_id?: string;
          warehouse_id: string;
          user_id?: string | null;
          do_id?: string | null;
          file_name: string;
          file_type: string;
          file_size: number;
          drive_file_id: string;
          drive_url: string;
          folder_path: string;
          category: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          file_id?: string;
          warehouse_id?: string;
          user_id?: string | null;
          do_id?: string | null;
          file_name?: string;
          file_type?: string;
          file_size?: number;
          drive_file_id?: string;
          drive_url?: string;
          folder_path?: string;
          category?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "files_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["warehouse_id"];
          },
          {
            foreignKeyName: "files_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "files_do_id_fkey";
            columns: ["do_id"];
            isOneToOne: false;
            referencedRelation: "delivery_orders";
            referencedColumns: ["do_id"];
          },
        ];
      };
      drive_integrations: {
        Row: {
          warehouse_id: string;
          refresh_token_encrypted: string;
          account_email: string | null;
          root_folder_id: string;
          connected_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          warehouse_id: string;
          refresh_token_encrypted: string;
          account_email?: string | null;
          root_folder_id: string;
          connected_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          warehouse_id?: string;
          refresh_token_encrypted?: string;
          account_email?: string | null;
          root_folder_id?: string;
          connected_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drive_integrations_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: true;
            referencedRelation: "warehouses";
            referencedColumns: ["warehouse_id"];
          },
          {
            foreignKeyName: "drive_integrations_connected_by_fkey";
            columns: ["connected_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
    };
    Views: {
      product_summary: {
        Row: {
          item_id: string;
          warehouse_id: string;
          product: string;
          default_quantity: number;
          unit: string;
          total_in: number;
          total_out: number;
          remaining: number;
        };
        Relationships: [];
      };
      item_totals: {
        Row: {
          item_id: string;
          warehouse_id: string;
          unit: string;
          total_weight: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_warehouse_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      verify_audit_integrity: {
        Args: { p_warehouse_id: string };
        Returns: Array<{
          ok: boolean;
          broken_at: number | null;
          message: string;
        }>;
      };
      append_audit_log: {
        Args: {
          p_warehouse_id: string;
          p_user_id: string | null;
          p_entity: string;
          p_entity_id: string | null;
          p_action: string;
          p_old_data: Record<string, unknown> | null;
          p_new_data: Record<string, unknown> | null;
          p_ip_address: string | null;
          p_user_agent: string | null;
          p_session_id: string | null;
          p_request_id: string | null;
          p_current_hash: string;
          p_timestamp?: string;
          p_actor_name?: string | null;
        };
        Returns: number;
      };
      repair_audit_chain: {
        Args: { p_warehouse_id: string };
        Returns: Array<{
          ok: boolean;
          repaired_count: number;
          message: string;
        }>;
      };
      purge_deleted_warehouses: {
        Args: { dry_run?: boolean };
        Returns: Array<{
          warehouse_id: string;
          name: string;
          deleted_ago: string;
        }>;
      };
      recoverable_warehouses: {
        Args: Record<string, never>;
        Returns: Array<{
          warehouse_id: string;
          name: string;
          deleted_ago: string;
        }>;
      };
    };
  };
};

// ─── Inventory Unit Types ─────────────────────────────────────────────

export const AVAILABLE_UNITS = [
  { value: "kg", label: "Kilogram (kg)", labelHi: "किलोग्राम" },
  { value: "g", label: "Gram (g)", labelHi: "ग्राम" },
  { value: "ml", label: "Millilitre (ml)", labelHi: "मिलीलीटर" },
  { value: "L", label: "Litre (L)", labelHi: "लीटर" },
  { value: "packet", label: "Packet", labelHi: "पैकेट" },
  { value: "dozen", label: "Dozen", labelHi: "दर्जन" },
  { value: "piece", label: "Piece", labelHi: "पीस" },
  { value: "box", label: "Box", labelHi: "डिब्बा" },
  { value: "bag", label: "Bag", labelHi: "बोरी" },
  { value: "custom", label: "Custom", labelHi: "कस्टम" },
] as const;

export type UnitValue = typeof AVAILABLE_UNITS[number]["value"];

// ─── Legacy Types ─────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

export interface DOItem {
  id: string;
  rstNo: string;
  itemName: string;
  noOfBags: number;
  weight: number;
}

export interface DO {
  id: string;
  tickerName: string;
  date: string;
  vehicleNumber: string;
  DONumber: string;
  direction: "IN" | "OUT";
  items: DOItem[];
  summary: string;
  createdAt: number;
  userId: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  count: number;
}

export interface AppState {
  users: User[];
  DOs: DO[];
  items: WarehouseItem[];
  currentUserId: string | null;
}
