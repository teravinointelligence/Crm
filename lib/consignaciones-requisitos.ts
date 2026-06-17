// Requisitos que TERAVINO solicita al consignatario para abrir una consignación.
// Fuente única de verdad: la usan el PDF descargable y el correo de solicitud.
// Sin `server-only`: son datos puros, compartibles entre PDF (server) y HTML.

export type RequisitoSeccion = {
  titulo: string;
  intro?: string;
  items: string[];
};

export const REQUISITOS_CONSIGNATARIO: RequisitoSeccion[] = [
  {
    titulo: "Documentación fiscal y legal",
    intro:
      "Para formalizar la consignación necesitamos los siguientes documentos del consignatario:",
    items: [
      "Constancia de Situación Fiscal (RFC) vigente, emitida por el SAT.",
      "Identificación oficial vigente del representante legal (INE o pasaporte).",
      "Comprobante de domicilio del establecimiento, con antigüedad no mayor a 3 meses.",
      "Opinión de cumplimiento de obligaciones fiscales (32-D) en sentido positivo.",
      "Datos bancarios o carátula del estado de cuenta para domiciliación de pagos.",
      "Contrato de consignación TERAVINO firmado por el representante legal.",
    ],
  },
  {
    titulo: "Datos operativos del punto de entrega",
    intro:
      "Además, requerimos la siguiente información para coordinar las entregas y las tomas de inventario:",
    items: [
      "Dirección exacta del punto de entrega y almacenamiento de la mercancía.",
      "Nombre y teléfono del contacto de almacén o recepción.",
      "Horario de recepción de mercancía.",
      "Nombre del responsable de inventario en sitio.",
    ],
  },
];

export const REQUISITOS_TITULO = "Requisitos para consignación";
export const REQUISITOS_NOTA =
  "Una vez reunidos los documentos, envíalos a tu ejecutivo TERAVINO o respóndelos a este correo. Cualquier duda, con gusto te apoyamos.";
