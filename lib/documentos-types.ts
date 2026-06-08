// Tipos y etiquetas puras de Teravino Docs, sin `server-only`, para poder
// compartirlos entre el cliente REST (lib/base44-docs.ts, server-only) y los
// componentes cliente (forms, control de estado). No incluye nada que toque la
// API key ni el entorno.

export type DocCategory = "contrato" | "cotizacion" | "factura" | "orden_compra" | "carta" | "otro";

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  contrato: "Contrato",
  cotizacion: "Cotización",
  factura: "Factura",
  orden_compra: "Orden de compra",
  carta: "Carta",
  otro: "Otro",
};

export type DocStatus = "borrador" | "finalizado" | "enviado";

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  borrador: "Borrador",
  finalizado: "Finalizado",
  enviado: "Enviado",
};

export type Base44DocTemplate = {
  id: string;
  name: string;
  description?: string;
  category: DocCategory;
  content_template: string;
  is_active?: boolean;
  created_date?: string;
  updated_date?: string;
};

export type Base44GeneratedDoc = {
  id: string;
  title: string;
  // Guardamos aquí el id de la cuenta del CRM (snapshot de referencia), ya que
  // los datos del cliente vienen de Cuentas y no de la entidad Client de Base44.
  client_id: string;
  template_id: string;
  content: string;
  client_name?: string;
  template_name?: string;
  status?: DocStatus;
  // Vendedor del CRM que lo generó (para scoping "cada quien ve los suyos").
  // created_by de Base44 no sirve: queda con el dueño de la API key.
  crm_rep_email?: string;
  crm_rep_name?: string;
  created_by?: string;
  created_date?: string;
  updated_date?: string;
};
