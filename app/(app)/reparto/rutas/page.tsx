// Página de rutas: Kanban con drag-and-drop para asignar pedidos a choferes.

import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { canViewReparto, canManageReparto } from "@/lib/modules";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { KanbanRutas } from "@/components/reparto/KanbanRutas";
import { ESTATUS_PENDIENTES, combinarConRezagados } from "@/lib/reparto-rutas";
import { crearResolvedorAsignacionAutomatica } from "@/lib/reparto/asignacion-automatica-server";
import { canSelfClaimLosCabos, isLosCabosDriver, normalizeDriverEmail } from "@/lib/reparto/autoservicio-los-cabos";
import { getRhDriverAvailability } from "@/lib/reparto/disponibilidad-rh";
import { PLAZA_LABEL } from "@/lib/reparto/asignacion-automatica";

export const metadata = { title: "Rutas — Reparto" };
export const dynamic = "force-dynamic";

const PEDIDO_SELECT =
  "id, numero_factura, tipo, fecha, ventana_inicio, ventana_fin, estatus, prioridad, total, cliente_id, chofer_id, direccion_entrega, clientes:cliente_id(id, nombre, ciudad, zona, rfc, horario_recepcion)";

export default async function RutasPage({
  searchParams,
}: {
  searchParams: { fecha?: string; rezagados?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewReparto(rep.role)) redirect("/");
  const canManage = canManageReparto(rep.role);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mazatlan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const fecha = searchParams.fecha ?? today;
  const incluirRezagados = searchParams.rezagados === "1";
  const rhAvailabilityPromise = rep.role === "chofer" && isLosCabosDriver(rep.email)
    ? getRhDriverAvailability(fecha)
    : Promise.resolve(null);

  const [{ data: pedidos }, { data: choferes }, rezagadosRes] = await Promise.all([
    repartoAdmin
      .from("pedidos")
      .select(PEDIDO_SELECT)
      .eq("fecha", fecha)
      .in("estatus", ["pendiente_asignar", "asignado", "en_ruta", "entregado", "no_entregado"])
      .order("ventana_inicio", { ascending: true })
      .order("created_at", { ascending: true }),
    repartoAdmin
      .from("usuarios")
      .select("id, nombre, email, es_chofer")
      .eq("activo", true)
      .order("es_chofer", { ascending: false })
      .order("nombre"),
    // Rezagados: pedidos de días ANTERIORES aún pendientes de entrega
    // (pendiente_asignar/asignado/en_ruta). Solo si el toggle está activo.
    incluirRezagados
      ? repartoAdmin
          .from("pedidos")
          .select(PEDIDO_SELECT)
          .lt("fecha", fecha)
          .in("estatus", [...ESTATUS_PENDIENTES])
          .order("fecha", { ascending: true })
          .order("ventana_inicio", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  // Horario de recepción para la tarjeta del Kanban: manda el capturado por el
  // vendedor en la cuenta del CRM (enlazada por RFC); si no hay match, se usa el
  // respaldo de reparto.clientes. Una sola consulta por lote de RFCs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pedidosRaw = combinarConRezagados((pedidos ?? []) as any[], (rezagadosRes.data ?? []) as any[]);
  const rfcs = Array.from(
    new Set(
      pedidosRaw
        .map((p) => (p.clientes?.rfc as string | null)?.trim().toUpperCase())
        .filter((r): r is string => Boolean(r)),
    ),
  );
  const accountHorario = new Map<string, string>();
  if (rfcs.length) {
    const { data: accts } = await supabaseAdmin()
      .from("accounts")
      .select("rfc, horario_recepcion")
      .in("rfc", rfcs)
      .not("horario_recepcion", "is", null);
    for (const a of accts ?? []) {
      const r = (a.rfc as string | null)?.trim().toUpperCase();
      if (r && a.horario_recepcion) accountHorario.set(r, a.horario_recepcion as string);
    }
  }
  const resolvedor = crearResolvedorAsignacionAutomatica();
  const pedidosEnriquecidos = await Promise.all(pedidosRaw.map(async (p) => {
    const rfc = (p.clientes?.rfc as string | null)?.trim().toUpperCase();
    const horario_recepcion =
      (rfc ? accountHorario.get(rfc) : null) ??
      (p.clientes?.horario_recepcion as string | null) ??
      null;
    const resolucion = p.cliente_id
      ? await resolvedor.resolverPorClienteId(p.cliente_id as string)
      : null;
    return {
      ...p,
      horario_recepcion,
      plaza_operativa: resolucion?.plaza ?? null,
      ubicacion_operativa: resolucion?.plaza ? PLAZA_LABEL[resolucion.plaza] : null,
    };
  }));

  const choferesActivos = (choferes ?? []) as { id: string; nombre: string; email: string; es_chofer: boolean }[];
  const currentDriver = rep.role === "chofer"
    ? choferesActivos.find(
        (chofer) => chofer.es_chofer && normalizeDriverEmail(chofer.email) === normalizeDriverEmail(rep.email),
      ) ?? null
    : null;
  const rhAvailability = await rhAvailabilityPromise;
  const canClaim = Boolean(
    currentDriver && rhAvailability?.ok && canSelfClaimLosCabos(rep.email, rhAvailability.availableEmails),
  );
  const availabilityMessage = rep.role !== "chofer"
    ? null
    : !currentDriver
      ? "Tu usuario de chofer no está activo en Reparto."
      : isLosCabosDriver(rep.email) && !rhAvailability?.ok
        ? "No se pudo confirmar tu disponibilidad con RH. Logística puede asignarte pedidos manualmente."
        : isLosCabosDriver(rep.email) && !canClaim
          ? "RH te marca como no disponible para esta fecha; no verás pedidos de Los Cabos sin asignar."
          : null;
  const pedidosVisibles = rep.role === "chofer"
    ? pedidosEnriquecidos.filter(
        (pedido) =>
          pedido.chofer_id === currentDriver?.id ||
          (canClaim && pedido.chofer_id === null && pedido.plaza_operativa === "los_cabos"),
      )
    : pedidosEnriquecidos;
  const choferesVisibles = rep.role === "chofer"
    ? (currentDriver ? [currentDriver] : [])
    : choferesActivos;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Rutas del día</h1>
        <p className="text-sm text-muted-foreground">
          {canManage
            ? 'Arrastra los pedidos de la columna "Sin asignar" hacia un chofer. Vuelve a arrastrar para reasignar.'
            : rep.role === "chofer"
              ? "Consulta tus pedidos; en Los Cabos puedes reservar uno o registrar directamente su entrega con evidencia."
              : "Vista de solo lectura: consulta cómo quedaron asignadas las rutas por chofer."}
        </p>
      </div>
      <KanbanRutas
        fecha={fecha}
        incluirRezagados={incluirRezagados}
        canManage={canManage}
        canClaim={canClaim}
        currentDriverId={currentDriver?.id ?? null}
        availabilityMessage={availabilityMessage}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pedidos={pedidosVisibles as any}
        choferes={choferesVisibles}
      />
    </div>
  );
}
