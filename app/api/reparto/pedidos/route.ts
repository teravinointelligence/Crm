// GET /api/reparto/pedidos — lista paginada con filtros (estatus, chofer, fechas, texto).
// POST /api/reparto/pedidos — crea un pedido manual con sus partidas.

import { NextResponse } from "next/server";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { requireReparto, requireRepartoManage } from "../_lib/guard";
import { PEDIDO_ESTATUS, PEDIDO_TIPOS, PRIORIDADES } from "@/types/reparto";

export const dynamic = "force-dynamic";

const ALLOWED_ESTATUS = new Set<string>(PEDIDO_ESTATUS);
const ALLOWED_PRIORIDADES = new Set<string>(PRIORIDADES);
const ALLOWED_TIPOS = new Set<string>(PEDIDO_TIPOS);

export async function GET(req: Request) {
  const { response } = await requireReparto();
  if (response) return response;
  const { searchParams } = new URL(req.url);

  const estatus = searchParams.get("estatus");
  const chofer = searchParams.get("chofer_id");
  const from = searchParams.get("fecha_from");
  const to = searchParams.get("fecha_to");
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const fromIdx = (page - 1) * limit;
  const toIdx = fromIdx + limit - 1;

  let query = repartoAdmin
    .from("pedidos")
    .select(
      "id, numero_factura, uuid_fiscal, tipo, fecha, ventana_inicio, ventana_fin, estatus, prioridad, total, moneda, origen, direccion_entrega, notas, created_at, cliente_id, chofer_id, clientes:cliente_id(id, nombre, rfc, ciudad), chofer:chofer_id(id, nombre, email)",
      { count: "exact" },
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (estatus && estatus !== "todos" && ALLOWED_ESTATUS.has(estatus)) {
    query = query.eq("estatus", estatus);
  }
  if (chofer && chofer !== "todos") {
    if (chofer === "sin_asignar") query = query.is("chofer_id", null);
    else query = query.eq("chofer_id", chofer);
  }
  if (from) query = query.gte("fecha", from);
  if (to) query = query.lte("fecha", to);
  if (q) {
    // numero_factura o uuid_fiscal o nombre del cliente (vía join no se puede filtrar
    // directamente con or → buscamos por numero_factura/uuid_fiscal en pedidos).
    query = query.or(`numero_factura.ilike.%${q}%,uuid_fiscal.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data ?? [],
    count: count ?? 0,
    page,
    limit,
  });
}

type ProductoInput = {
  descripcion: string;
  cantidad: number;
  unidad?: string | null;
  clave_sat?: string | null;
  valor_unitario: number;
  importe?: number;
  descuento?: number | null;
};

export async function POST(req: Request) {
  const { response } = await requireRepartoManage();
  if (response) return response;
  const body = await req.json();

  const numero_factura = String(body?.numero_factura ?? "").trim();
  const fecha = String(body?.fecha ?? "").trim();
  if (!numero_factura) return NextResponse.json({ error: "numero_factura requerido" }, { status: 400 });
  if (!fecha) return NextResponse.json({ error: "fecha requerida" }, { status: 400 });
  if (!body?.cliente_id) return NextResponse.json({ error: "cliente_id requerido" }, { status: 400 });
  const productos = Array.isArray(body?.productos) ? (body.productos as ProductoInput[]) : [];
  if (!productos.length) return NextResponse.json({ error: "Agrega al menos una partida" }, { status: 400 });

  const prioridad = ALLOWED_PRIORIDADES.has(body?.prioridad) ? body.prioridad : "normal";
  const tipo = ALLOWED_TIPOS.has(body?.tipo) ? body.tipo : "factura";
  const subtotal = productos.reduce((s, p) => {
    const importe = Number(p.importe);
    if (Number.isFinite(importe) && importe > 0) return s + importe;
    return s + Number(p.cantidad) * Number(p.valor_unitario);
  }, 0);
  const total = Number(body?.total ?? subtotal * 1.16);
  const iva = Number(body?.iva ?? total - subtotal);

  const { data: pedido, error: pedidoErr } = await repartoAdmin
    .from("pedidos")
    .insert({
      numero_factura,
      uuid_fiscal: body?.uuid_fiscal?.trim() || null,
      tipo,
      cliente_id: body.cliente_id,
      chofer_id: body?.chofer_id || null,
      fecha,
      ventana_inicio: body?.ventana_inicio || null,
      ventana_fin: body?.ventana_fin || null,
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(total * 100) / 100,
      moneda: body?.moneda || "MXN",
      estatus: body?.chofer_id ? "asignado" : "pendiente_asignar",
      prioridad,
      origen: body?.origen || "manual",
      direccion_entrega: body?.direccion_entrega?.trim() || null,
      notas: body?.notas?.trim() || null,
    })
    .select("id")
    .single();
  if (pedidoErr || !pedido) {
    return NextResponse.json({ error: pedidoErr?.message ?? "No se creó el pedido" }, { status: 500 });
  }

  const partidas = productos.map((p) => {
    const cantidad = Number(p.cantidad) || 0;
    const vu = Number(p.valor_unitario) || 0;
    return {
      pedido_id: pedido.id,
      descripcion: String(p.descripcion ?? "").trim(),
      cantidad,
      unidad: p.unidad ?? null,
      clave_sat: p.clave_sat ?? null,
      valor_unitario: vu,
      importe: Math.round((Number(p.importe ?? cantidad * vu)) * 100) / 100,
      descuento: p.descuento != null ? Number(p.descuento) : 0,
    };
  });

  const { error: itemsErr } = await repartoAdmin.from("pedido_productos").insert(partidas);
  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message, pedido_id: pedido.id }, { status: 500 });
  }

  return NextResponse.json({ data: { id: pedido.id } });
}
