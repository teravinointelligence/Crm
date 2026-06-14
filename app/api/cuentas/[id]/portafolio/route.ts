// /api/cuentas/[id]/portafolio
//
// GET  → vista previa: { to, cliente, detectedZona, zonasDisponibles }.
//        No envía nada; el diálogo elige la zona y confirma.
// POST → envía el portafolio (enlace al PDF) a todos los correos de la cuenta,
//        desde ventas@teravino.com vía Resend. Body: { zona: <slug> }.
//
// Auth: admin o el vendedor asignado a la cuenta (la RLS restringe accounts).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { sendEmail, ventasFrom } from "@/lib/email";
import { loadEnvioPortafolio, renderPortafolioEmail } from "@/lib/portafolios-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createClient();
  const ctx = await loadEnvioPortafolio(supabase, params.id);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  return NextResponse.json({
    cliente: ctx.cliente,
    to: ctx.to,
    detectedZona: ctx.detectedZona,
    zonasDisponibles: ctx.zonasDisponibles.map((z) => ({ slug: z.slug, nombre: z.nombre })),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const zonaSlug = typeof body?.zona === "string" ? body.zona : null;
  if (!zonaSlug) return NextResponse.json({ error: "Elige una zona." }, { status: 400 });

  const supabase = createClient();
  const ctx = await loadEnvioPortafolio(supabase, params.id);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const zona = ctx.zonasDisponibles.find((z) => z.slug === zonaSlug);
  if (!zona) {
    return NextResponse.json({ error: "No hay un portafolio cargado para esa zona." }, { status: 400 });
  }

  const { subject, html } = renderPortafolioEmail({
    cliente: ctx.cliente,
    zonaNombre: zona.nombre,
    pdfUrl: zona.pdfUrl,
    repNombre: rep.full_name,
  });

  try {
    const result = await sendEmail({
      to: ctx.to,
      subject,
      html,
      from: ventasFrom(),
      replyTo: rep.email || undefined,
    });
    return NextResponse.json({ ok: true, id: result.id, to: ctx.to, zonaNombre: zona.nombre });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al enviar el correo" },
      { status: 502 },
    );
  }
}
