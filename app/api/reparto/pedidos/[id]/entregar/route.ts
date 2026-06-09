// POST /api/reparto/pedidos/[id]/entregar
// El chofer (o logística) marca el pedido como entregado y sube la foto de la
// factura firmada como evidencia. La foto se sube server-side con service_role
// al bucket público `evidencias` (la RLS del bucket exige que la primera carpeta
// sea el rep_id, así que un chofer no puede subir a `entregas/` desde el
// navegador; por eso lo hacemos aquí). Crea el registro en reparto.entregas y
// pone el pedido en estatus "entregado".

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessReparto } from "@/lib/modules";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canAccessReparto(rep.role)) {
    return NextResponse.json({ error: "Sin acceso a Reparto" }, { status: 403 });
  }

  // Pedido + chofer asignado.
  const { data: pedido, error: pedErr } = await repartoAdmin
    .from("pedidos")
    .select("id, estatus, chofer_id")
    .eq("id", params.id)
    .single();
  if (pedErr || !pedido) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // El chofer del CRM se enlaza con su usuario de Reparto por email.
  const { data: usuario } = await repartoAdmin
    .from("usuarios")
    .select("id")
    .ilike("email", rep.email)
    .maybeSingle();

  // Un chofer solo puede registrar la entrega de los pedidos asignados a él.
  // Logística/admin pueden registrar cualquiera.
  if (rep.role === "chofer") {
    if (!usuario?.id || pedido.chofer_id !== usuario.id) {
      return NextResponse.json(
        { error: "Solo puedes registrar la entrega de tus pedidos asignados." },
        { status: 403 },
      );
    }
  }

  // Archivo (foto de la factura firmada).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
  }
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ error: "Sube la foto de la factura firmada." }, { status: 400 });
  }
  if (!foto.type.startsWith("image/")) {
    return NextResponse.json({ error: "El archivo debe ser una imagen." }, { status: 400 });
  }
  if (foto.size > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen supera 10 MB." }, { status: 400 });
  }

  const observaciones = (form.get("observaciones") as string | null)?.trim() || null;
  const latRaw = form.get("lat");
  const lngRaw = form.get("lng");
  const lat = typeof latRaw === "string" && latRaw !== "" ? Number(latRaw) : null;
  const lng = typeof lngRaw === "string" && lngRaw !== "" ? Number(lngRaw) : null;

  // Subida al bucket público `evidencias` bajo `entregas/` (mismo lugar que el
  // histórico migrado). foto_url se guarda como URL pública directa.
  const ext = EXT_BY_TYPE[foto.type] ?? "jpg";
  const path = `entregas/${params.id}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await foto.arrayBuffer());
  const storage = supabaseAdmin().storage.from("evidencias");
  const { error: upErr } = await storage.upload(path, buffer, {
    contentType: foto.type,
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: `No se pudo subir la foto: ${upErr.message}` }, { status: 500 });
  }
  const { data: pub } = storage.getPublicUrl(path);
  const fotoUrl = pub.publicUrl;

  // chofer_id de la entrega: el asignado al pedido, o el usuario actual.
  const choferId = pedido.chofer_id ?? usuario?.id ?? null;

  // reparto.entregas.pedido_id es UNIQUE (una entrega por pedido). Si el chofer
  // re-sube la foto, se reemplaza la evidencia en vez de fallar por el constraint.
  const { data: entrega, error: insErr } = await repartoAdmin
    .from("entregas")
    .upsert(
      {
        pedido_id: params.id,
        chofer_id: choferId,
        foto_url: fotoUrl,
        observaciones,
        lat: Number.isFinite(lat as number) ? lat : null,
        lng: Number.isFinite(lng as number) ? lng : null,
        timestamp_entrega: new Date().toISOString(),
      },
      { onConflict: "pedido_id" },
    )
    .select("id")
    .single();
  if (insErr) {
    return NextResponse.json({ error: `No se pudo registrar la entrega: ${insErr.message}` }, { status: 500 });
  }

  // El pedido pasa a "entregado".
  const { error: updErr } = await repartoAdmin
    .from("pedidos")
    .update({ estatus: "entregado", motivo_problema: null })
    .eq("id", params.id);
  if (updErr) {
    return NextResponse.json(
      { error: `Entrega registrada, pero no se pudo actualizar el estatus: ${updErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, entrega_id: entrega.id, foto_url: fotoUrl });
}
