// POST /api/reparto/pedidos/[id]/entregar
// El chofer (o logística) marca el pedido como entregado y deja la foto de la
// factura firmada como evidencia en el bucket público `evidencias`.
//
// Dos formas de mandar la foto:
//  1. JSON { foto_path } — el navegador ya la subió con la URL firmada que emite
//     ./upload-url. Es el camino normal: no pasa por esta función, así que no le
//     aplica el tope de ~4.5 MB del cuerpo de una ruta API en Vercel.
//  2. multipart con el archivo en `foto` — respaldo para clientes viejos; sujeto
//     a ese tope.
// En ambos casos se crea el registro en reparto.entregas y el pedido pasa a
// estatus "entregado".

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { autorizarEntrega } from "@/lib/reparto/entregas";
import {
  EXT_POR_TIPO,
  rutaEvidencia,
  rutaValida,
  TIPO_POR_EXT,
} from "@/lib/reparto/evidencias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // tope real del cuerpo en Vercel (~4.5 MB)

// Fotos elegidas del álbum del celular a veces llegan sin MIME type; en ese caso
// validamos por extensión para no rechazar una imagen válida.
const EXT_IMAGEN = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;

type Datos = {
  path: string | null;
  observaciones: string | null;
  lat: number | null;
  lng: number | null;
};

function aNumero(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor) : typeof valor === "number" ? valor : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await autorizarEntrega(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const storage = supabaseAdmin().storage.from("evidencias");
  let datos: Datos;

  if (req.headers.get("content-type")?.includes("application/json")) {
    // Camino normal: la foto ya está en storage, aquí solo llega su ruta.
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    if (!rutaValida(params.id, body.foto_path)) {
      return NextResponse.json({ error: "Falta la foto de la factura firmada." }, { status: 400 });
    }
    datos = {
      path: body.foto_path as string,
      observaciones: (body.observaciones as string | undefined)?.trim() || null,
      lat: aNumero(body.lat),
      lng: aNumero(body.lng),
    };
  } else {
    // Respaldo: el archivo viene en el cuerpo y lo subimos aquí.
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
    const extArchivo = foto.name.match(EXT_IMAGEN)?.[1]?.toLowerCase() ?? null;
    if (!(foto.type ? foto.type.startsWith("image/") : Boolean(extArchivo))) {
      return NextResponse.json({ error: "El archivo debe ser una imagen." }, { status: 400 });
    }
    if (foto.size > MAX_BYTES) {
      return NextResponse.json({ error: "La imagen es demasiado pesada." }, { status: 400 });
    }

    const tipoFoto = foto.type || (extArchivo ? TIPO_POR_EXT[extArchivo] : null) || "image/jpeg";
    const path = rutaEvidencia(params.id, EXT_POR_TIPO[tipoFoto] ?? "jpg");
    const { error: upErr } = await storage.upload(path, Buffer.from(await foto.arrayBuffer()), {
      contentType: tipoFoto,
      upsert: true,
    });
    if (upErr) {
      return NextResponse.json({ error: `No se pudo subir la foto: ${upErr.message}` }, { status: 500 });
    }
    datos = {
      path,
      observaciones: (form.get("observaciones") as string | null)?.trim() || null,
      lat: aNumero(form.get("lat")),
      lng: aNumero(form.get("lng")),
    };
  }

  // foto_url se guarda como URL pública directa (mismo formato que el histórico).
  const fotoUrl = storage.getPublicUrl(datos.path as string).data.publicUrl;

  // chofer_id de la entrega: el asignado al pedido, o el usuario actual.
  const choferId = auth.pedido.chofer_id ?? auth.usuarioId ?? null;

  // reparto.entregas.pedido_id es UNIQUE (una entrega por pedido). Si el chofer
  // re-sube la foto, se reemplaza la evidencia en vez de fallar por el constraint.
  const { data: entrega, error: insErr } = await repartoAdmin
    .from("entregas")
    .upsert(
      {
        pedido_id: params.id,
        chofer_id: choferId,
        foto_url: fotoUrl,
        observaciones: datos.observaciones,
        lat: datos.lat,
        lng: datos.lng,
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
