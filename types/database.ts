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
          credit_days: number | null;
          dias_pago: string | null;
          dias_revision: string | null;
          horario_recepcion: string | null;
          ventana_revision: number | null;
          ventana_suspension: number | null;
          is_legacy: boolean | null;
          es_socio: boolean | null;
          fiscal_name: string | null;
          id: string;
          notes: string | null;
          price_tier: string | null;
          region: string | null;
          rfc: string | null;
          uso_cfdi: string | null;
          regimen_fiscal: string | null;
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
          next_step_done: boolean;
          notes: string | null;
          outcome: string | null;
          sales_rep_id: string | null;
          status: string;
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
          birthday: string | null;
          created_at: string | null;
          created_by: string | null;
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
          warehouse: string | null;
          fulfillment_status: string;
          fulfilled_at: string | null;
          fulfilled_by: string | null;
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
          discontinued_at: string | null;
          discontinued_by: string | null;
          id: string;
          image_url: string | null;
          last_stock_source: string | null;
          last_stock_update: string | null;
          name: string;
          notes: string | null;
          proposed_at: string | null;
          proposed_by: string | null;
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
          last_seen_at: string | null;
          modules: string[] | null;
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
      sops: {
        Row: {
          id: string;
          title: string;
          category: string | null;
          drive_file_id: string;
          file_kind: string | null;
          sort_order: number | null;
          active: boolean | null;
          created_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["sops"]["Row"]> & {
          title: string;
          drive_file_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["sops"]["Row"]>;
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
      monthly_sales_items: {
        Row: {
          id: string;
          monthly_sale_id: string;
          codigo: string | null;
          producto_nombre: string;
          cantidad: number | null;
          neto: number | null;
          descuento: number | null;
          neto_desc: number | null;
          impuesto: number | null;
          total: number | null;
          created_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["monthly_sales_items"]["Row"]> & {
          monthly_sale_id: string;
          producto_nombre: string;
        };
        Update: Partial<Database["public"]["Tables"]["monthly_sales_items"]["Row"]>;
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

export type Sop = Database["public"]["Tables"]["sops"]["Row"];

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

// ---------------------------------------------------------------------
// Academy (módulo de formación). Tablas creadas en 0047/0048; aún no están
// en los tipos generados de Supabase, así que se declaran a mano.
// ---------------------------------------------------------------------
export type AcademyWine = {
  id: string;
  name: string;
  producer: string | null;
  region: string | null;
  country: string | null;
  type: string | null;
  grape_varieties: string[] | null;
  vintage: string | null;
  price: number | null;
  alcohol_content: number | null;
  tasting_notes: string | null;
  pairing: string | null;
  aging: string | null;
  serving_temperature: string | null;
  image_url: string | null;
  location: string | null;
  base44_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AcademyQuizResult = {
  id: string;
  rep_id: string;
  category: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  time_spent_seconds: number | null;
  streak: number | null;
  created_at: string;
};

export type AcademyQuizResultInsert = {
  rep_id: string;
  category: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  time_spent_seconds?: number | null;
  streak?: number | null;
};

export type AcademyLeaderboardRow = {
  rep_id: string;
  full_name: string;
  primary_region: string | null;
  quizzes: number;
  avg_score: number;
  best_streak: number | null;
  total_correct: number;
  last_quiz_at: string;
};

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

export type ActivityStatus = "agendada" | "realizada" | "cancelada";

export const ACTIVITY_STATUSES: ActivityStatus[] = [
  "agendada",
  "realizada",
  "cancelada",
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
  // Conciliación bancaria (ver 0035_bank_reconciliation.sql) — opcionales.
  bank_transaction_id?: string | null;
  created_by?: string | null;
  confirmado?: boolean;
};

// ---------------------------------------------------------------------
// CONCILIACIÓN BANCARIA — ver 0035_bank_reconciliation.sql
// ---------------------------------------------------------------------
export type BankStatement = {
  id: string;
  bank: string | null;
  account_label: string | null;
  account_number: string | null;
  period_start: string | null;
  period_end: string | null;
  file_path: string | null;
  file_name: string | null;
  file_kind: "pdf" | "csv" | "xlsx" | null;
  status: "pendiente" | "procesado";
  uploaded_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type BankTransaction = {
  id: string;
  bank_statement_id: string;
  txn_date: string | null;
  description: string | null;
  reference: string | null;
  amount: number;
  kind: "abono" | "cargo";
  estado_conciliacion: "sin_conciliar" | "sugerido" | "conciliado" | "ignorado";
  matched_account_id: string | null;
  suggestion: unknown | null;
  row_index: number | null;
  created_at: string | null;
};

export type PaymentAllocation = {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount_applied: number;
  created_at: string | null;
};

export type AccountAging = {
  account_id: string;
  business_name: string | null;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  saldo_total: number;
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
  dias_vencido: number | null;
  es_socio: boolean | null;
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

// ---------------------------------------------------------------------
// ACUERDOS (bitácora cronológica por empresa) — ver 0032_agreements.sql
// ---------------------------------------------------------------------
export type AgreementType =
  | "comodato"
  | "precio_especial"
  | "consignacion"
  | "exclusividad"
  | "volumen"
  | "otro";

export type AgreementStatus = "vigente" | "vencido" | "cancelado";

export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  comodato: "Comodato",
  precio_especial: "Precio especial",
  consignacion: "Consignación",
  exclusividad: "Exclusividad",
  volumen: "Volumen",
  otro: "Otro",
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  vigente: "Vigente",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export type EquipmentKind = "cava" | "coravin" | "enfriador" | "mueble" | "otro";

export const EQUIPMENT_KIND_LABELS: Record<EquipmentKind, string> = {
  cava: "Cava",
  coravin: "Equipo Coravin",
  enfriador: "Enfriador",
  mueble: "Mueble / exhibidor",
  otro: "Otro",
};

export type AgreementEquipment = {
  id: string;
  agreement_id: string;
  kind: EquipmentKind;
  description: string;
  quantity: number;
  serial: string | null;
  status: "prestado" | "devuelto";
  returned_at: string | null;
  created_at: string | null;
};

export type Agreement = {
  id: string;
  account_id: string;
  agreement_date: string;
  title: string;
  description: string | null;
  type: AgreementType;
  status: AgreementStatus;
  price_notes: string | null;
  discount_pct: number | null;
  credit_days: number | null;
  valid_from: string | null;
  valid_until: string | null;
  contact_id: string | null;
  rep_id: string | null;
  document_path: string | null;
  document_uploaded_at: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AgreementWithEquipment = Agreement & {
  equipment: AgreementEquipment[];
};

export type AgreementEquipmentInsert = {
  kind: EquipmentKind;
  description: string;
  quantity: number;
  serial: string | null;
};

// ---------------------------------------------------------------------
// CUMPLEAÑOS — vista v_upcoming_birthdays (ver 0033_contact_birthday.sql)
// ---------------------------------------------------------------------
export type UpcomingBirthday = {
  contact_id: string;
  account_id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  birthday: string;
  business_name: string | null;
  region: string | null;
  assigned_rep_id: string | null;
  next_birthday: string;
  days_until: number;
};
