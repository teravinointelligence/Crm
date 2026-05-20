// POST /api/consignaciones — crear una consignación en Base44.
//
// Auth/scope:
//   - admin: puede crear para cualquier vendedor (toma vendedor_id del payload)
//   - rep: el server fuerza vendedor_id = su propio Vendedor en Base44 (match
//     por email). Si el rep no tiene match en Base44 → 403.
//
// El total se recalcula server-side a partir de los items, no se confía en el
// total que mande el cliente.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Cliente,
  type Base44Consignacion,
  type Base44ConsignacionItem,
  type Base44Producto,
  type Base44Vendedor,
} from "@/lib/base44";

type ItemInput = {
  producto_id: string;
  cantidad: number;
  precio_unitario?: number;
};

type CreateInput = {
  cliente_id: string;
  vendedor_id?: string; // admin puede mandar; rep se ignora
  fecha: string;
  items: ItemInput[];
  notas?: string;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return bad("No autenticado", 401);
  const isAdmin = rep.role === "admin";

  let input: CreateInput;
  try {
    input = (await req.json()) as CreateInput;
  } catch {
    return bad("Body inválido (JSON)");
  }

  if (!input.cliente_id) return bad("Falta cliente_id");
  if (!input.fecha) return bad("Falta fecha");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return bad("Debe incluir al menos un item");
  }

  // Resolve vendedor.
  let vendedor: Base44Vendedor | null = null;
  if (isAdmin && input.vendedor_id) {
    try {
      vendedor = await base44.entity<Base44Vendedor>("Vendedor").get(input.vendedor_id);
    } catch {
      return bad("Vendedor no existe en Base44");
    }
  } else {
    vendedor = await resolveBase44Vendedor(rep.email);
    if (!vendedor) {
      return bad(
        "Tu usuario no está enlazado a un vendedor en Base44. Pídele a un admin que dé de alta tu correo en TERAVINO Flow.",
        403,
      );
    }
  }

  // Resolve cliente para denormalizar nombre.
  let cliente: Base44Cliente;
  try {
    cliente = await base44.entity<Base44Cliente>("Cliente").get(input.cliente_id);
  } catch {
    return bad("Cliente no existe en Base44");
  }

  // Resolve productos en lote para denormalizar nombre y validar existencia/precios.
  const productIds = Array.from(new Set(input.items.map((i) => i.producto_id)));
  const productos = await base44.entity<Base44Producto>("Producto").list({
    q: { id: { $in: productIds } },
    limit: productIds.length,
  });
  const byId = new Map(productos.map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !byId.has(id));
  if (missing.length) {
    return bad(`Productos no encontrados: ${missing.join(", ")}`);
  }

  // Construir items con precio_unitario y subtotal calculados server-side.
  const items: Base44ConsignacionItem[] = [];
  for (const it of input.items) {
    const cantidad = Number(it.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return bad(`Cantidad inválida para producto ${it.producto_id}`);
    }
    const prod = byId.get(it.producto_id)!;
    const precio = Number(
      it.precio_unitario != null ? it.precio_unitario : prod.precio_unitario ?? 0,
    );
    if (!Number.isFinite(precio) || precio < 0) {
      return bad(`Precio inválido para producto ${prod.nombre}`);
    }
    items.push({
      producto_id: prod.id,
      producto_nombre: prod.nombre,
      cantidad,
      precio_unitario: precio,
      subtotal: Math.round(cantidad * precio * 100) / 100,
    });
  }

  const total = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

  const payload: Partial<Base44Consignacion> = {
    cliente_id: cliente.id,
    cliente_nombre: cliente.nombre,
    vendedor_id: vendedor.id,
    vendedor_nombre: vendedor.nombre,
    fecha: input.fecha,
    items,
    total,
    estado: "pendiente",
    cantidad_vendida: 0,
    cantidad_devuelta: 0,
    monto_cobrado: 0,
    notas: input.notas?.trim() || undefined,
  };

  try {
    const created = await base44.entity<Base44Consignacion>("Consignacion").create(payload);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Error al crear consignación", 502);
  }
}
