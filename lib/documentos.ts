// Lógica de generación de documentos de Teravino Docs: mapeo de los datos de una
// Cuenta del CRM (+ su contacto principal) a los placeholders {{...}} de una
// plantilla, y sustitución del texto. Compartido por la ruta de generación.
//
// Placeholders que usan las plantillas en Base44:
//   {{company_name}} {{contact_name}} {{rfc}} {{address}} {{city}} {{state}}
//   {{zip_code}} {{email}} {{phone}} {{fecha_actual}} {{numero_documento}}

import "server-only";

// Subconjunto de columnas de `accounts` que necesitamos para llenar plantillas.
export type DocAccount = {
  id: string;
  business_name: string;
  fiscal_name: string | null;
  rfc: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
};

// Contacto principal de la cuenta (de `contacts`), opcional.
export type DocContact = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
} | null;

// Marcador para los campos que no tenemos en el CRM: se deja una línea para
// rellenar a mano al firmar (ej. RFC faltante, contacto sin teléfono, C.P.).
const BLANK = "________________";

function val(x: string | null | undefined): string {
  const t = (x ?? "").trim();
  return t.length ? t : BLANK;
}

function today(): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date());
}

/** Genera un folio legible para el documento, ej. TD-20260607-4821. */
export function generateDocNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `TD-${y}${m}${d}-${suffix}`;
}

/** Construye el mapa de variables que alimenta la plantilla. */
export function buildPlaceholderVars({
  account,
  contact,
  numeroDocumento,
}: {
  account: DocAccount;
  contact: DocContact;
  numeroDocumento: string;
}): Record<string, string> {
  return {
    company_name: val(account.business_name || account.fiscal_name),
    contact_name: val(contact?.full_name),
    rfc: val(account.rfc),
    address: val(account.address),
    city: val(account.city),
    state: val(account.region),
    zip_code: BLANK, // accounts no guarda código postal
    email: val(contact?.email),
    phone: val(contact?.phone || contact?.whatsapp),
    fecha_actual: today(),
    numero_documento: numeroDocumento,
  };
}

/**
 * Sustituye los placeholders {{clave}} de la plantilla. Las claves conocidas se
 * reemplazan con su valor (o una línea en blanco si faltan); cualquier {{otra}}
 * que la plantilla traiga y no mapeemos se vuelve una línea para llenar a mano,
 * de modo que nunca se filtre un literal {{...}} al documento final.
 */
export function mergeTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const v = vars[key];
    return v != null && v !== "" ? v : BLANK;
  });
}

export type ConsignacionItemDoc = {
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

/**
 * Genera el bloque de texto {{lista_vinos}} para incluir en contratos de
 * consignación. Produce una tabla ASCII legible en cualquier editor.
 */
export function buildListaVinos(items: ConsignacionItemDoc[]): string {
  if (!items.length) return "(sin productos cargados)";
  const header = "Producto | Cant. | Precio unit. | Subtotal";
  const sep = "---------|-------|--------------|----------";
  const rows = items.map((it) => {
    const precio = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(it.precio_unitario);
    const sub = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(it.subtotal);
    return `${it.producto_nombre} | ${it.cantidad} | ${precio} | ${sub}`;
  });
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const totalFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(total);
  return [header, sep, ...rows, sep, `TOTAL | | | ${totalFmt}`].join("\n");
}
