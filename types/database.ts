export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string | null;
          address: string | null;
          assigned_rep_id: string | null;
          business_name: string;
          city: string | null;
          client_number: string | null;
          created_at: string | null;
          fiscal_name: string | null;
          id: string;
          notes: string | null;
          price_tier: string | null;
          region: string | null;
          rfc: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["accounts"]["Row"]> & {
          business_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Row"]>;
        Relationships: [];
      };
      activities: {
        Row: {
          account_id: string;
          activity_date: string;
          activity_type: string | null;
          contact_id: string | null;
          created_at: string | null;
          duration_minutes: number | null;
          id: string;
          next_step: string | null;
          next_step_date: string | null;
          notes: string | null;
          outcome: string | null;
          sales_rep_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["activities"]["Row"]> & {
          account_id: string;
          activity_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["activities"]["Row"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          account_id: string;
          created_at: string | null;
          email: string | null;
          full_name: string;
          id: string;
          is_primary: boolean | null;
          notes: string | null;
          phone: string | null;
          role: string | null;
          whatsapp: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["contacts"]["Row"]> & {
          account_id: string;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Row"]>;
        Relationships: [];
      };
      inventory_imports: {
        Row: {
          error_log: Json | null;
          id: string;
          import_type: string | null;
          imported_at: string | null;
          imported_by: string | null;
          rows_error: number | null;
          rows_ok: number | null;
          rows_total: number | null;
          source_file_name: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["inventory_imports"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["inventory_imports"]["Row"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          account_id: string;
          balance: number | null;
          created_at: string | null;
          due_date: string | null;
          id: string;
          invoice_date: string;
          invoice_number: string;
          iva: number | null;
          notes: string | null;
          order_id: string | null;
          payment_terms_days: number | null;
          pdf_url: string | null;
          status: string | null;
          subtotal: number | null;
          total: number;
          total_paid: number | null;
          updated_at: string | null;
          uuid_fiscal: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["invoices"]["Row"]> & {
          account_id: string;
          invoice_date: string;
          invoice_number: string;
          total: number;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Row"]>;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          line_total: number;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          supplier: string | null;
          unit: string | null;
          unit_price: number;
          vintage: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["order_items"]["Row"]> & {
          order_id: string;
          product_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Row"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          account_id: string;
          created_at: string | null;
          id: string;
          iva: number | null;
          notes: string | null;
          order_date: string;
          order_number: string;
          order_type: string;
          sales_rep_id: string | null;
          status: string | null;
          subtotal: number | null;
          total: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["orders"]["Row"]> & {
          account_id: string;
          order_number: string;
          order_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          account_id: string;
          amount: number;
          created_at: string | null;
          id: string;
          invoice_id: string | null;
          method: string | null;
          notes: string | null;
          payment_date: string;
          reference: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          account_id: string;
          amount: number;
          payment_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      products: {
        Row: {
          active: boolean | null;
          base_price: number;
          category: string | null;
          country: string | null;
          created_at: string | null;
          id: string;
          image_url: string | null;
          last_stock_source: string | null;
          last_stock_update: string | null;
          name: string;
          notes: string | null;
          region_origin: string | null;
          sku: string | null;
          stock_min_alert: number | null;
          stock_quantity: number | null;
          supplier: string;
          updated_at: string | null;
          varietal: string | null;
          vintage: string | null;
          volume_ml: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & {
          name: string;
          supplier: string;
          base_price: number;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Row"]>;
        Relationships: [];
      };
      sales_reps: {
        Row: {
          active: boolean | null;
          auth_user_id: string | null;
          created_at: string | null;
          email: string;
          full_name: string;
          id: string;
          primary_region: string | null;
          role: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["sales_reps"]["Row"]> & {
          email: string;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_reps"]["Row"]>;
        Relationships: [];
      };
      monthly_sales: {
        Row: {
          id: string;
          account_id: string;
          sales_rep_id: string | null;
          period: string;
          client_number: string | null;
          client_name: string | null;
          vendedor_excel: string | null;
          venta_bruta: number | null;
          neto: number | null;
          descuento: number | null;
          neto_desc: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["monthly_sales"]["Row"]> & {
          account_id: string;
          period: string;
        };
        Update: Partial<Database["public"]["Tables"]["monthly_sales"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      next_order_number: { Args: { p_order_type: string }; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_rep_id: { Args: Record<string, never>; Returns: string };
      get_product_price: {
        Args: { p_product_id: string; p_price_tier: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type AccountInsert = Database["public"]["Tables"]["accounts"]["Insert"];
export type AccountUpdate = Database["public"]["Tables"]["accounts"]["Update"];

export type MonthlySale = Database["public"]["Tables"]["monthly_sales"]["Row"];
export type MonthlySaleInsert = Database["public"]["Tables"]["monthly_sales"]["Insert"];

export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];

export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type ActivityInsert = Database["public"]["Tables"]["activities"]["Insert"];

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];

export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];

export type SalesRep = Database["public"]["Tables"]["sales_reps"]["Row"];

export type Region =
  | "Los Cabos"
  | "La Paz"
  | "Todos Santos"
  | "Tijuana"
  | "Puerto Vallarta"
  | "Nayarit";

export const REGIONS: Region[] = [
  "Los Cabos",
  "La Paz",
  "Todos Santos",
  "Tijuana",
  "Puerto Vallarta",
  "Nayarit",
];

export type PriceTier = "base" | "+10";

export type AccountType =
  | "hotel"
  | "restaurante"
  | "bar"
  | "cafe"
  | "club"
  | "tienda"
  | "distribuidor"
  | "otro";

export const ACCOUNT_TYPES: AccountType[] = [
  "hotel",
  "restaurante",
  "bar",
  "cafe",
  "club",
  "tienda",
  "distribuidor",
  "otro",
];

export type AccountStatus = "prospecto" | "activo" | "inactivo" | "perdido";
export const ACCOUNT_STATUSES: AccountStatus[] = [
  "prospecto",
  "activo",
  "inactivo",
  "perdido",
];

export type ActivityType =
  | "visita"
  | "llamada"
  | "email"
  | "whatsapp"
  | "degustacion"
  | "reunion"
  | "evento";

export const ACTIVITY_TYPES: ActivityType[] = [
  "visita",
  "llamada",
  "email",
  "whatsapp",
  "degustacion",
  "reunion",
  "evento",
];

export type ProductCategory =
  | "vino_tinto"
  | "vino_blanco"
  | "vino_rosado"
  | "vino_naranja"
  | "espumoso"
  | "destilado"
  | "cerveza"
  | "sake"
  | "otro";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "vino_tinto",
  "vino_blanco",
  "vino_rosado",
  "vino_naranja",
  "espumoso",
  "destilado",
  "cerveza",
  "sake",
  "otro",
];

export type Invoice = {
  id: string;
  invoice_number: string;
  account_id: string;
  order_id: string | null;
  invoice_date: string;
  due_date: string | null;
  payment_terms_days: number | null;
  subtotal: number | null;
  iva: number | null;
  total: number;
  total_paid: number | null;
  balance: number | null;
  status: string | null;
  uuid_fiscal: string | null;
  pdf_url: string | null;
  notes: string | null;
};

export type Payment = {
  id: string;
  invoice_id: string | null;
  account_id: string;
  payment_date: string;
  amount: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

export type AccountProduct = {
  id: string;
  account_id: string;
  product_id: string;
  status: "muestra" | "encartado" | "descartado";
  notes: string | null;
  added_by: string | null;
  since: string | null;
  created_at: string | null;
};

export type AccountBalance = {
  account_id: string;
  business_name: string | null;
  region: string | null;
  assigned_rep_id: string | null;
  total_facturado: number | null;
  total_pagado: number | null;
  saldo_pendiente: number | null;
  saldo_vencido: number | null;
  facturas_abiertas: number | null;
};

export const PAYMENT_METHODS = [
  "transferencia",
  "efectivo",
  "cheque",
  "tarjeta",
  "deposito",
  "otro",
] as const;

export type OrderType = "cotizacion" | "pedido";
export type OrderStatus =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "rechazada"
  | "facturada"
  | "entregada"
  | "cancelada";
