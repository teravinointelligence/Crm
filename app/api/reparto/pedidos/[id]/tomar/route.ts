import { NextResponse } from "next/server";
import { requireReparto } from "../../../_lib/guard";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { crearResolvedorAsignacionAutomatica } from "@/lib/reparto/asignacion-automatica-server";
import { canSelfClaimLosCabos, isLosCabosDriver } from "@/lib/reparto/autoservicio-los-cabos";
import { getRhDriverAvailability } from "@/lib/reparto/disponibilidad-rh";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const { rep, response } = await requireReparto();
  if (response) return response;
  if (!rep || rep.role !== "chofer" || !isLosCabosDriver(rep.email)) {
    return NextResponse.json({ error: "Solo los choferes de Los Cabos pueden tomar estos pedidos" }, { status: 403 });
  }

  const { data: driver } = await repartoAdmin
    .from("usuarios")
    .select("id, nombre, email")
    .eq("activo", true)
    .eq("es_chofer", true)
    .ilike("email", rep.email)
    .limit(1)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json({ error: "Tu usuario de chofer no está activo en Reparto" }, { status: 403 });
  }

  const { data: pedido } = await repartoAdmin
    .from("pedidos")
    .select("id, numero_factura, fecha, estatus, chofer_id, cliente_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  if (pedido.chofer_id === driver.id) {
    return NextResponse.json({ data: pedido });
  }
  if (pedido.chofer_id || pedido.estatus !== "pendiente_asignar") {
    return NextResponse.json({ error: "Otro chofer ya tomó este pedido" }, { status: 409 });
  }
  if (!pedido.cliente_id) {
    return NextResponse.json({ error: "El pedido no tiene cliente para validar su plaza" }, { status: 409 });
  }

  const resolver = crearResolvedorAsignacionAutomatica();
  const plaza = await resolver.resolverPorClienteId(pedido.cliente_id);
  if (plaza.plaza !== "los_cabos") {
    return NextResponse.json({ error: "Este pedido no pertenece a la ruta de Los Cabos" }, { status: 403 });
  }

  const availability = await getRhDriverAvailability(pedido.fecha);
  if (!availability.ok) {
    return NextResponse.json(
      { error: "No pudimos confirmar tu disponibilidad con RH. Logística puede asignarlo manualmente." },
      { status: 503 },
    );
  }
  if (!canSelfClaimLosCabos(rep.email, availability.availableEmails)) {
    return NextResponse.json({ error: "RH te marca como no disponible para esta fecha" }, { status: 409 });
  }

  // La condición chofer_id IS NULL evita que dos choferes tomen el mismo pedido
  // aunque pulsen el botón al mismo tiempo.
  const { data: claimed, error } = await repartoAdmin
    .from("pedidos")
    .update({ chofer_id: driver.id, estatus: "asignado" })
    .eq("id", pedido.id)
    .is("chofer_id", null)
    .eq("estatus", "pendiente_asignar")
    .select("id, numero_factura, fecha, estatus, chofer_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: "Otro chofer ya tomó este pedido" }, { status: 409 });
  return NextResponse.json({ data: claimed });
}
