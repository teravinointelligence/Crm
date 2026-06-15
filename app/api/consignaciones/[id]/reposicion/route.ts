// POST /api/consignaciones/[id]/reposicion
//
// "Reponer productos": crea un pedido en el proyecto Reparto para resurtir el
// producto consumido de una consignación. El pedido queda pendiente de asignar
// chofer (logística lo despacha desde el módulo de Reparto).
//
// Identidad cross-system: el cliente de Reparto es de su propia tabla; el caller
// elige el reparto_cliente_id (buscado vía /api/consignaciones/reparto-clientes).
//
// Sin migración de Reparto: usamos origen='manual' + un tag parseable en notas
// para identificar la reposición y enlazarla a la consignación.

import { NextResponse } from "next/server";
import { base44, type Base44Consignacion } from "@/lib/base44";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { appendNota, loadConsignacionForRep } from "../../_lib/scope";

type ProductoInput = {
  descripcion: string;
  cantidad: number;
  valor_unitario?: number;
};

type Body = {
  reparto_cliente_id: string;
  productos: ProductoInput[];
  prioridad?: "normal" | "alta" | "urgente";
  notas?: string;
};

const PRIORIDADES = new Set(["normal", "alta", "urgente"]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await loadConsignacionForRep(params.id);
  if (!scope.ok) return scope.response;
  const { consignacion, repFullName } = scope;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido (JSON)" }, { status: 400 });
  }

  if (!body.reparto_cliente_id) {
    return NextResponse.json({ error: "Selecciona el cliente de Reparto destino" }, { status: 400 });
  }
  const productos = Array.isArray(body.productos) ? body.productos : [];
  const validProductos = productos.filter(
    (p) => p.descripcion?.trim() && Number(p.cantidad) > 0,
  );
  if (!validProductos.length) {
    return NextResponse.json({ error: "Agrega al menos un producto a reponer" }, { status: 400 });
  }

  // Verifica que el cliente de Reparto exista.
  const { data: cliente, error: cliErr } = await repartoAdmin
    .from("clientes")
    .select("id, nombre, direccion")
    .eq("id", body.reparto_cliente_id)
    .maybeSingle();
  if (cliErr) return NextResponse.json({ error: cliErr.message }, { status: 500 });
  if (!cliente) {
    return NextResponse.json({ error: "El cliente de Reparto no existe" }, { status: 400 });
  }

  const prioridad = body.prioridad && PRIORIDADES.has(body.prioridad) ? body.prioridad : "normal";
  const subtotal = validProductos.reduce(
    (s, p) => s + Number(p.cantidad) * Number(p.valor_unitario ?? 0),
    0,
  );
  const total = Math.round(subtotal * 1.16 * 100) / 100;
  const iva = Math.round((total - subtotal) * 100) / 100;

  const hoy = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const numeroFactura = `RESURT-${hoy.replace(/-/g, "")}-${rand}`;
  const refConsig = consignacion.cliente_nombre ?? consignacion.id;
  const tag = `[RESURTIDO CONSIGNACIÓN · ${refConsig} · ref:${consignacion.id}]`;
  const notas = `${tag}${body.notas?.trim() ? ` ${body.notas.trim()}` : ""}`;

  // Crea el pedido en Reparto (pendiente de asignar chofer).
  const { data: pedido, error: pedidoErr } = await repartoAdmin
    .from("pedidos")
    .insert({
      numero_factura: numeroFactura,
      // Los resurtidos de consignación se tramitan como traspaso de almacén.
      tipo: "traspaso",
      cliente_id: cliente.id,
      fecha: hoy,
      subtotal: Math.round(subtotal * 100) / 100,
      iva,
      total,
      moneda: "MXN",
      estatus: "pendiente_asignar",
      prioridad,
      origen: "manual",
      direccion_entrega: cliente.direccion ?? null,
      notas,
    })
    .select("id")
    .single();
  if (pedidoErr || !pedido) {
    return NextResponse.json({ error: pedidoErr?.message ?? "No se creó el pedido de reparto" }, { status: 500 });
  }

  const partidas = validProductos.map((p) => {
    const cantidad = Number(p.cantidad) || 0;
    const vu = Number(p.valor_unitario ?? 0) || 0;
    return {
      pedido_id: pedido.id,
      descripcion: p.descripcion.trim(),
      cantidad,
      valor_unitario: vu,
      importe: Math.round(cantidad * vu * 100) / 100,
      descuento: 0,
    };
  });
  const { error: itemsErr } = await repartoAdmin.from("pedido_productos").insert(partidas);
  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message, pedido_id: pedido.id }, { status: 500 });
  }

  // Bitácora en la consignación.
  const totalUnidades = validProductos.reduce((s, p) => s + Number(p.cantidad), 0);
  const summary = `Reposición solicitada → ${totalUnidades} unidades a ${cliente.nombre} (pedido reparto ${numeroFactura})`;
  try {
    await base44.entity<Base44Consignacion>("Consignacion").update(consignacion.id, {
      notas: appendNota(consignacion.notas, summary, repFullName),
    });
  } catch {
    // El pedido ya se creó; la bitácora es secundaria.
  }

  return NextResponse.json({ ok: true, pedido_id: pedido.id, numero_factura: numeroFactura });
}
