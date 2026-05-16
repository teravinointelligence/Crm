// POST /api/reparto/pedidos/upload-cfdi — sube uno o varios XML (o un ZIP)
// y crea los pedidos correspondientes en Reparto. Idempotente por uuid_fiscal.

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { parseCfdi, type CfdiParsed } from "@/lib/cfdi/parse";
import { requireAdmin } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Outcome = {
  archivo: string;
  status: "creado" | "ya_existe" | "error";
  pedido_id?: string;
  numero_factura?: string;
  error?: string;
};

async function readFiles(form: FormData): Promise<{ name: string; xml: string }[]> {
  const out: { name: string; xml: string }[] = [];
  const entries = form.getAll("files");
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    const lower = entry.name.toLowerCase();
    if (lower.endsWith(".xml")) {
      out.push({ name: entry.name, xml: await entry.text() });
    } else if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await entry.arrayBuffer());
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;
        if (!path.toLowerCase().endsWith(".xml")) continue;
        out.push({ name: path.split("/").pop() ?? path, xml: await file.async("text") });
      }
    }
  }
  return out;
}

async function ensureCliente(parsed: CfdiParsed): Promise<{ id: string; created: boolean } | null> {
  const rfc = parsed.receptor.rfc;
  if (rfc) {
    const { data } = await repartoAdmin
      .from("clientes")
      .select("id")
      .ilike("rfc", rfc)
      .limit(1)
      .maybeSingle();
    if (data?.id) return { id: data.id, created: false };
  }
  if (parsed.receptor.nombre) {
    const { data } = await repartoAdmin
      .from("clientes")
      .select("id")
      .ilike("nombre", parsed.receptor.nombre)
      .limit(1)
      .maybeSingle();
    if (data?.id) return { id: data.id, created: false };
  }
  if (!parsed.receptor.nombre) return null;
  const { data: nuevo, error } = await repartoAdmin
    .from("clientes")
    .insert({
      rfc: parsed.receptor.rfc,
      nombre: parsed.receptor.nombre,
      notas: parsed.receptor.codigo_postal ? `CP fiscal: ${parsed.receptor.codigo_postal}` : null,
    })
    .select("id")
    .single();
  if (error || !nuevo) return null;
  return { id: nuevo.id, created: true };
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  let files: { name: string; xml: string }[];
  try {
    const form = await req.formData();
    files = await readFiles(form);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error leyendo archivos" }, { status: 400 });
  }
  if (!files.length) {
    return NextResponse.json({ error: "Sube al menos un .xml o un .zip con XMLs" }, { status: 400 });
  }

  const results: Outcome[] = [];
  let creados = 0;
  let yaExistentes = 0;
  let clientesCreados = 0;

  for (const { name, xml } of files) {
    try {
      const parsed = parseCfdi(xml);
      // Idempotencia: si existe un pedido con el mismo uuid_fiscal, lo saltamos.
      if (parsed.uuid) {
        const { data: existing } = await repartoAdmin
          .from("pedidos")
          .select("id")
          .eq("uuid_fiscal", parsed.uuid)
          .maybeSingle();
        if (existing?.id) {
          results.push({ archivo: name, status: "ya_existe", pedido_id: existing.id, numero_factura: parsed.numero_factura });
          yaExistentes++;
          continue;
        }
      }
      const cli = await ensureCliente(parsed);
      if (!cli) {
        results.push({ archivo: name, status: "error", numero_factura: parsed.numero_factura, error: "No pude identificar/crear el cliente" });
        continue;
      }
      if (cli.created) clientesCreados++;

      const { data: pedido, error: pedErr } = await repartoAdmin
        .from("pedidos")
        .insert({
          numero_factura: parsed.numero_factura,
          uuid_fiscal: parsed.uuid,
          cliente_id: cli.id,
          fecha: parsed.fecha,
          subtotal: parsed.subtotal,
          iva: parsed.iva,
          total: parsed.total,
          moneda: parsed.moneda,
          estatus: "pendiente_asignar",
          prioridad: "normal",
          origen: "xml_upload",
        })
        .select("id")
        .single();
      if (pedErr || !pedido) {
        results.push({ archivo: name, status: "error", numero_factura: parsed.numero_factura, error: pedErr?.message });
        continue;
      }

      if (parsed.partidas.length) {
        const partidas = parsed.partidas.map((p) => ({
          pedido_id: pedido.id,
          descripcion: p.descripcion,
          cantidad: p.cantidad,
          unidad: p.unidad,
          clave_sat: p.clave_sat,
          valor_unitario: p.valor_unitario,
          importe: p.importe || Math.round(p.cantidad * p.valor_unitario * 100) / 100,
          descuento: p.descuento,
        }));
        await repartoAdmin.from("pedido_productos").insert(partidas);
      }

      results.push({ archivo: name, status: "creado", pedido_id: pedido.id, numero_factura: parsed.numero_factura });
      creados++;
    } catch (e) {
      results.push({ archivo: name, status: "error", error: e instanceof Error ? e.message : "Error desconocido" });
    }
  }

  return NextResponse.json({
    summary: { total: files.length, creados, ya_existen: yaExistentes, errores: results.filter((r) => r.status === "error").length, clientes_creados: clientesCreados },
    results,
  });
}
