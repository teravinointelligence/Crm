// Página de rutas: Kanban con drag-and-drop para asignar pedidos a choferes.

import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { KanbanRutas } from "@/components/reparto/KanbanRutas";

export const metadata = { title: "Rutas — Reparto" };
export const dynamic = "force-dynamic";

export default async function RutasPage({ searchParams }: { searchParams: { fecha?: string } }) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  const today = new Date().toISOString().slice(0, 10);
  const fecha = searchParams.fecha ?? today;

  const [{ data: pedidos }, { data: choferes }] = await Promise.all([
    repartoAdmin
      .from("pedidos")
      .select(
        "id, numero_factura, fecha, ventana_inicio, ventana_fin, estatus, prioridad, total, chofer_id, direccion_entrega, clientes:cliente_id(id, nombre, ciudad, zona)",
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
        pedidos={(pedidos ?? []) as any}
        choferes={(choferes ?? []) as { id: string; nombre: string; email: string }[]}
      />
    </div>
  );
}
