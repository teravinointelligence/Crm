// POST /api/documentos — genera un documento a partir de una plantilla de
// Teravino Docs (Base44) y los datos de una Cuenta del CRM, y lo guarda como
// GeneratedDocument en Base44.
//
// El cliente sale de Cuentas del CRM (no de la entidad Client de Base44): el
// vendedor elige la cuenta y server-side resolvemos cuenta + contacto principal,
// sustituimos los placeholders y persistimos el resultado.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  base44Docs,
  type Base44DocTemplate,
  type Base44GeneratedDoc,
} from "@/lib/base44-docs";
import {
  buildPlaceholderVars,
  generateDocNumber,
  mergeTemplate,
  type DocAccount,
  type DocContact,
} from "@/lib/documentos";

type CreateInput = {
  template_id: string;
  account_id: string;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);

  let input: CreateInput;
  try {
    input = (await req.json()) as CreateInput;
  } catch {
    return bad("Body inválido (JSON)");
  }
  if (!input.template_id) return bad("Falta template_id");
  if (!input.account_id) return bad("Falta account_id");

  // 1) Plantilla desde Base44.
  let template: Base44DocTemplate;
  try {
    template = await base44Docs.entity<Base44DocTemplate>("DocumentTemplate").get(input.template_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg.includes("BASE44_DOCS")) return bad(msg, 503);
    return bad("La plantilla no existe en Teravino Docs", 404);
  }

  // 2) Cuenta del CRM (con RLS del usuario: solo ve las cuentas permitidas).
  const supabase = createClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, fiscal_name, rfc, address, city, region")
    .eq("id", input.account_id)
    .single();
  if (!account) return bad("La cuenta no existe o no tienes acceso", 404);

  // 3) Contacto principal (opcional) para nombre/correo/teléfono.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("full_name, email, phone, whatsapp, is_primary")
    .eq("account_id", input.account_id)
    .order("is_primary", { ascending: false })
    .limit(1);
  const contact: DocContact = contacts?.[0]
    ? {
        full_name: contacts[0].full_name ?? null,
        email: contacts[0].email ?? null,
        phone: contacts[0].phone ?? null,
        whatsapp: contacts[0].whatsapp ?? null,
      }
    : null;

  // 4) Merge.
  const numero = generateDocNumber();
  const vars = buildPlaceholderVars({ account: account as DocAccount, contact, numeroDocumento: numero });
  const content = mergeTemplate(template.content_template, vars);
  const title = `${template.name} — ${account.business_name}`;

  // 5) Guardar el documento generado en Base44.
  const payload: Partial<Base44GeneratedDoc> = {
    title,
    client_id: account.id, // snapshot: id de la cuenta del CRM
    client_name: account.business_name,
    template_id: template.id,
    template_name: template.name,
    content,
    status: "borrador",
    crm_rep_email: rep.email,
    crm_rep_name: rep.full_name,
  };
  try {
    const created = await base44Docs
      .entity<Base44GeneratedDoc>("GeneratedDocument")
      .create(payload);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Error al generar el documento", 502);
  }
}
