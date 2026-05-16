// Tipos del dominio "Reparto" (proyecto Supabase secundario rrxcggeaejqrarxycxmf).

export const PEDIDO_ESTATUS = [
  "pendiente_asignar",
  "asignado",
  "en_ruta",
  "entregado",
  "no_entregado",
] as const;
export type PedidoEstatus = (typeof PEDIDO_ESTATUS)[number];

export const PRIORIDADES = ["normal", "alta", "urgente"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const ORIGENES = ["manual", "xml_upload", "email_xml"] as const;
export type Origen = (typeof ORIGENES)[number];

export type Usuario = {
  id: string;
  auth_id: string | null;
  nombre: string;
  email: string;
  rol: string | null;
  telefono: string | null;
  activo: boolean;
  es_chofer: boolean;
  expo_push_token: string | null;
  created_at: string | null;
};

export type Cliente = {
  id: string;
  rfc: string | null;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  zona: string | null;
  contacto_nombre: string | null;
  contacto_tel: string | null;
  contacto_email: string | null;
  horario_recepcion: string | null;
  notas: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Pedido = {
  id: string;
  numero_factura: string;
  uuid_fiscal: string | null;
  cliente_id: string | null;
  chofer_id: string | null;
  fecha: string; // yyyy-mm-dd
  ventana_inicio: string | null;
  ventana_fin: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  moneda: string | null;
  estatus: PedidoEstatus;
  origen: Origen | string;
  notas: string | null;
  motivo_problema: string | null;
  direccion_entrega: string | null;
  prioridad: Prioridad | null;
  xml_url: string | null;
  pdf_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PedidoProducto = {
  id: string;
  pedido_id: string;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  clave_sat: string | null;
  valor_unitario: number;
  importe: number;
  descuento: number | null;
};

export type Entrega = {
  id: string;
  pedido_id: string;
  chofer_id: string | null;
  timestamp_entrega: string | null;
  lat: number | null;
  lng: number | null;
  foto_url: string | null;
  compartido_whatsapp: boolean | null;
  observaciones: string | null;
  created_at: string | null;
};

export type PedidoConRelaciones = Pedido & {
  clientes: Pick<Cliente, "id" | "nombre" | "rfc" | "ciudad" | "zona"> | null;
  chofer: Pick<Usuario, "id" | "nombre" | "email"> | null;
  pedido_productos: PedidoProducto[];
  entregas?: Entrega[];
};

export type PedidoFiltros = {
  estatus?: PedidoEstatus | "todos";
  chofer_id?: string | "todos";
  fecha_from?: string;
  fecha_to?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export const ESTATUS_LABEL: Record<PedidoEstatus, string> = {
  pendiente_asignar: "Pendiente",
  asignado: "Asignado",
  en_ruta: "En ruta",
  entregado: "Entregado",
  no_entregado: "No entregado",
};

export const ESTATUS_VARIANT: Record<PedidoEstatus, "muted" | "warning" | "accent" | "success" | "danger"> = {
  pendiente_asignar: "muted",
  asignado: "accent",
  en_ruta: "warning",
  entregado: "success",
  no_entregado: "danger",
};
