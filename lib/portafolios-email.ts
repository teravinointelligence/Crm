// Envío del portafolio de vinos a un cliente por correo. Compartido entre la
// vista previa (GET) y el envío real (POST) de /api/cuentas/[id]/portafolio.
// NO envía nada por sí mismo: arma los datos y el HTML (con un ENLACE al PDF).

import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { PORTAFOLIO_ZONAS } from "@/lib/portafolios";

type DbClient = ReturnType<typeof createClient>;

/**
 * Mapea el campo `region` de una cuenta a la zona de portafolio
 * correspondiente. Es un default: el usuario puede cambiar la zona en el
 * diálogo de envío. Devuelve null si no hay coincidencia clara.
 */
export function regionToZonaSlug(region: string | null | undefined): string | null {
  if (!region) return null;
  const r = region.trim().toLowerCase();
  if (r.includes("cabo")) return "los-cabos";
  if (r.includes("paz")) return "la-paz";
  if (r.includes("tijuana")) return "tijuana";
  if (r.includes("vallarta") || r.includes("nayarit") || r.includes("banderas")) return "vallarta";
  if (r.includes("todos santos")) return "los-cabos"; // BCS sur: opera con Los Cabos
  return null;
}

export type ZonaDisponible = { slug: string; nombre: string; pdfUrl: string };

export type Vendedor = { nombre: string; email: string | null; whatsapp: string | null };

export type EnvioContext =
  | {
      ok: true;
      cliente: string;
      to: string[];
      detectedZona: string | null;
      zonasDisponibles: ZonaDisponible[];
      vendedor: Vendedor | null;
    }
  | { ok: false; status: number; error: string };

/** Reúne destinatarios + zonas con portafolio cargado para preparar el envío. */
export async function loadEnvioPortafolio(
  supabase: DbClient,
  accountId: string,
): Promise<EnvioContext> {
  // La RLS restringe accounts al admin o al rep dueño; si no la ve, 404.
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, fiscal_name, region, assigned_rep_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return { ok: false, status: 404, error: "Cuenta no encontrada" };

  const [{ data: contacts }, { data: portafolios }] = await Promise.all([
    supabase
      .from("contacts")
      .select("email, is_primary")
      .eq("account_id", accountId)
      .not("email", "is", null)
      .order("is_primary", { ascending: false }),
    supabase.from("portafolios").select("zona, pdf_url"),
  ]);

  // Correos registrados (contacto principal primero), deduplicados sin
  // distinguir mayúsculas.
  const seen = new Set<string>();
  const to: string[] = [];
  for (const c of (contacts ?? []) as { email: string | null }[]) {
    const email = c.email?.trim();
    if (!email || !email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    to.push(email);
  }
  if (!to.length) {
    return {
      ok: false,
      status: 400,
      error: "El cliente no tiene un contacto con email. Agrégalo en la ficha de la cuenta.",
    };
  }

  // Zonas que YA tienen un portafolio cargado, en el orden canónico.
  const urlByZona = new Map<string, string>(
    (portafolios ?? [])
      .filter((p): p is { zona: string; pdf_url: string } => !!p?.pdf_url)
      .map((p) => [p.zona, p.pdf_url]),
  );
  const zonasDisponibles: ZonaDisponible[] = PORTAFOLIO_ZONAS.filter((z) => urlByZona.has(z.slug)).map(
    (z) => ({ slug: z.slug, nombre: z.nombre, pdfUrl: urlByZona.get(z.slug)! }),
  );
  if (!zonasDisponibles.length) {
    return { ok: false, status: 400, error: "Aún no hay portafolios cargados. Súbelos en el módulo Portafolios." };
  }

  const detected = regionToZonaSlug(account.region);
  const detectedZona = detected && urlByZona.has(detected) ? detected : null;

  // Vendedor asignado a la cuenta (para mostrar sus datos de contacto en el
  // correo). Si la cuenta no tiene vendedor, el correo deja solo los contactos
  // oficiales de TERAVINO.
  let vendedor: Vendedor | null = null;
  if (account.assigned_rep_id) {
    const { data: rep } = await supabase
      .from("sales_reps")
      .select("full_name, email, whatsapp")
      .eq("id", account.assigned_rep_id)
      .maybeSingle();
    if (rep) {
      const r = rep as { full_name: string; email: string | null; whatsapp: string | null };
      vendedor = { nombre: r.full_name, email: r.email, whatsapp: r.whatsapp };
    }
  }

  return {
    ok: true,
    cliente: account.fiscal_name || account.business_name,
    to,
    detectedZona,
    zonasDisponibles,
    vendedor,
  };
}

// Contactos oficiales de TERAVINO (segundos contactos, siempre presentes).
const TERAVINO_VENTAS_EMAIL = "ventas@teravino.com";
const TERAVINO_WA_DISPLAY = "624 178 3189";
const TERAVINO_WA_LINK = "https://wa.me/526241783189";

/** Construye un enlace wa.me a partir de un número (agrega lada MX si faltara). */
function waLink(num: string): string {
  const digits = num.replace(/\D/g, "");
  const full = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${full}`;
}

/** Arma el asunto + HTML del correo con un botón/enlace para ver el portafolio. */
export function renderPortafolioEmail(input: {
  cliente: string;
  zonaNombre: string;
  pdfUrl: string;
  vendedor?: Vendedor | null;
}): { subject: string; html: string } {
  const { cliente, zonaNombre, pdfUrl, vendedor } = input;

  const link = (href: string, text: string) =>
    `<a href="${href}" target="_blank" style="color:#7a1220;text-decoration:none;">${text}</a>`;

  // Bloque del vendedor asignado (si la cuenta tiene uno).
  const vendedorBloque = vendedor
    ? `
    <p style="margin:0 0 4px;"><strong>Tu asesor en TERAVINO:</strong> ${vendedor.nombre}</p>
    <p style="margin:0 0 14px;color:#444;font-size:14px;">
      ${vendedor.whatsapp ? `WhatsApp: ${link(waLink(vendedor.whatsapp), vendedor.whatsapp)}` : ""}
      ${vendedor.whatsapp && vendedor.email ? " · " : ""}
      ${vendedor.email ? link(`mailto:${vendedor.email}`, vendedor.email) : ""}
    </p>`
    : "";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Portafolio de vinos</h2>
    <p style="margin:0 0 16px;color:#666;">${cliente}</p>
    <p>Estimado cliente,</p>
    <p>Con gusto te enviamos nuestro portafolio de vinos actualizado para <strong>${zonaNombre}</strong>. Puedes consultarlo o descargarlo desde el siguiente enlace:</p>
    <p style="margin:24px 0;">
      <a href="${pdfUrl}" target="_blank"
         style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">
        Ver portafolio (PDF)
      </a>
    </p>
    <p style="color:#666;font-size:13px;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${pdfUrl}" target="_blank" style="color:#7a1220;word-break:break-all;">${pdfUrl}</a>
    </p>
    <p style="margin-top:16px;">Quedamos atentos para tomar tu pedido. ¡Gracias por tu preferencia!</p>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
      ${vendedorBloque}
      <p style="margin:0;color:#666;font-size:13px;">
        También puedes escribirnos: ${link(`mailto:${TERAVINO_VENTAS_EMAIL}`, TERAVINO_VENTAS_EMAIL)}
        · WhatsApp ${link(TERAVINO_WA_LINK, TERAVINO_WA_DISPLAY)}
      </p>
    </div>
  </div>`;
  return { subject: `Portafolio de vinos TERAVINO — ${zonaNombre}`, html };
}
