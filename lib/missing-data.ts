// Detección de "datos faltantes" por cuenta, para avisar al vendedor.
// Criterios (Sabrina): sin ningún contacto · sin contacto con email · sin
// teléfono/WhatsApp · sin contacto de cuentas por pagar · sin RFC o razón social.

export type MissingFlag = "sin_contactos" | "sin_email" | "sin_tel" | "sin_ap" | "sin_fiscal";

export const MISSING_LABEL: Record<MissingFlag, string> = {
  sin_contactos: "Sin ningún contacto",
  sin_email: "Sin contacto con email",
  sin_tel: "Sin teléfono ni WhatsApp",
  sin_ap: "Sin contacto de cuentas por pagar",
  sin_fiscal: "Sin RFC o razón social",
};

export type ContactLite = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  role: string | null;
};
export type AccountLite = { rfc: string | null; fiscal_name: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Roles que cuentan como "cuentas por pagar" (quien procesa los pagos a Teravino).
const AP_KEYS = [
  "cuentas por pagar", "por pagar", "cxp", "pagos", "pago",
  "contabilidad", "contable", "administracion", "administrativo",
  "tesoreria", "finanzas",
];

function isApContact(role: string | null): boolean {
  if (!role) return false;
  const r = norm(role);
  return AP_KEYS.some((k) => r.includes(k));
}

const has = (v: string | null | undefined) => !!(v && v.trim());

/** Banderas de datos faltantes de una cuenta dado su conjunto de contactos. */
export function missingFlags(account: AccountLite, contacts: ContactLite[]): MissingFlag[] {
  const out: MissingFlag[] = [];
  if (contacts.length === 0) {
    out.push("sin_contactos"); // engloba email/tel/ap
  } else {
    if (!contacts.some((c) => has(c.email))) out.push("sin_email");
    if (!contacts.some((c) => has(c.phone) || has(c.whatsapp))) out.push("sin_tel");
    if (!contacts.some((c) => isApContact(c.role))) out.push("sin_ap");
  }
  if (!has(account.rfc) || !has(account.fiscal_name)) out.push("sin_fiscal");
  return out;
}
