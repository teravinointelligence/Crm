// Página de rutas: Kanban con drag-and-drop para asignar pedidos a choferes.

import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { canAccessReparto } from "@/lib/modules";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { KanbanRutas } from "@/components/reparto/KanbanRutas";

export const metadata = { title: "Rutas — Reparto" };
export const dynamic = "force-dynamic";

export default async function RutasPage({ searchParams }: { searchParams: { fecha?: string } }) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canAccessReparto(rep.role)) redirect("/");

  const today = new Date().toISOString().slice(0, 10);
  const fecha = searchParams.fecha ?? today;

  const [{ data: pedidos }, { data: choferes }] = await Promise.all([
    repartoAdmin
      .from("pedidos")
      .select(
        "id, numero_factura, fecha, ventana_inicio, ventana_fin, estatus, prioridad, total, chofer_id, direccion_entrega, clientes:cliente_id(id, nombre, ciudad, zona, rfc, horario_recepcion)",
      )
      .eq("fecha", fecha)
      .in("estatus", ["pendiente_asignar", "asignado", "en_ruta", "entregado", "no_entregado"])
      .order("ventana_inicio", { ascending: true })
      .order("created_at", { ascending: true }),
    repartoAdmin
      .from("usuarios")
      .select("id, nombre, email")
      .eq("es_chofer", true)
      .eq("activo", true)
      .order("nombre"),
  ]);

  // Horario de recepción para la tarjeta del Kanban: manda el capturado por el
  // vendedor en la cuenta del CRM (enlazada por RFC); si no hay match, se usa el
  // respaldo de reparto.clientes. Una sola consulta por lote de RFCs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pedidosRaw = (pedidos ?? []) as any[];
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
  const pedidosEnriquecidos = pedidosRaw.map((p) => {
    const rfc = (p.clientes?.rfc as string | null)?.trim().toUpperCase();
    const horario_recepcion =
      (rfc ? accountHorario.get(rfc) : null) ??
      (p.clientes?.horario_recepcion as string | null) ??
      null;
    return { ...p, horario_recepcion };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Rutas del día</h1>
        <p className="text-sm text-muted-foreground">
          Arrastra los pedidos de la columna "Sin asignar" hacia un chofer. Vuelve a arrastrar para reasignar.
        </p>
      </div>
      <KanbanRutas
        fecha={fecha}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pedidos={pedidosEnriquecidos as any}
        choferes={(choferes ?? []) as { id: string; nombre: string; email: string }[]}
      />
    </div>
  );
}
