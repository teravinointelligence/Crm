// Listado de pedidos de Reparto con filtros (estatus, chofer, fechas, búsqueda).

import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PedidosFilters } from "@/components/reparto/PedidosFilters";
import { UploadCFDI } from "@/components/reparto/UploadCFDI";
import { ESTATUS_LABEL, ESTATUS_VARIANT, type PedidoEstatus } from "@/types/reparto";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Pedidos — Reparto" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  numero_factura: string;
  fecha: string;
  ventana_inicio: string | null;
  ventana_fin: string | null;
  estatus: PedidoEstatus;
  prioridad: string | null;
  total: number | null;
  direccion_entrega: string | null;
  clientes: { id: string; nombre: string; ciudad: string | null; rfc: string | null } | null;
  chofer: { id: string; nombre: string } | null;
};

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { estatus?: string; chofer_id?: string; fecha_from?: string; fecha_to?: string; q?: string; page?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const limit = 50;
  const fromIdx = (page - 1) * limit;
  const toIdx = fromIdx + limit - 1;

  let query = repartoAdmin
    .from("pedidos")
    .select(
      "id, numero_factura, fecha, ventana_inicio, ventana_fin, estatus, prioridad, total, direccion_entrega, clientes:cliente_id(id, nombre, ciudad, rfc), chofer:chofer_id(id, nombre)",
      { count: "exact" },
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (searchParams.estatus && searchParams.estatus !== "todos") {
    query = query.eq("estatus", searchParams.estatus);
  }
  if (searchParams.chofer_id && searchParams.chofer_id !== "todos") {
    if (searchParams.chofer_id === "sin_asignar") query = query.is("chofer_id", null);
    else query = query.eq("chofer_id", searchParams.chofer_id);
  }
  if (searchParams.fecha_from) query = query.gte("fecha", searchParams.fecha_from);
  if (searchParams.fecha_to) query = query.lte("fecha", searchParams.fecha_to);
  if (searchParams.q?.trim()) {
    const q = searchParams.q.trim();
    query = query.or(`numero_factura.ilike.%${q}%,uuid_fiscal.ilike.%${q}%`);
  }

  const [{ data, count }, { data: choferes }] = await Promise.all([
    query,
    repartoAdmin.from("usuarios").select("id, nombre").eq("es_chofer", true).eq("activo", true).order("nombre"),
  ]);

  const rows = ((data ?? []) as unknown) as Row[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Pedidos de reparto</h1>
          <p className="text-sm text-muted-foreground">Asignación, ventana horaria y seguimiento.</p>
        </div>
        <div className="flex gap-2">
          <UploadCFDI />
          <Button asChild>
            <Link href="/reparto/pedidos/nuevo"><Plus className="mr-1 h-4 w-4" /> Nuevo pedido</Link>
          </Button>
        </div>
      </div>

      <PedidosFilters
        choferes={choferes ?? []}
        initial={{
          estatus: searchParams.estatus ?? "todos",
          chofer_id: searchParams.chofer_id ?? "todos",
          fecha_from: searchParams.fecha_from ?? "",
          fecha_to: searchParams.fecha_to ?? "",
          q: searchParams.q ?? "",
        }}
      />

      <p className="text-xs text-muted-foreground">{count ?? 0} pedido(s) · página {page} de {totalPages}</p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <Truck className="h-8 w-8 text-brand-carmesi" />
          <h3 className="font-display text-lg">Sin pedidos en este filtro</h3>
          <p className="text-sm text-muted-foreground">Ajusta los filtros o crea uno nuevo.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Chofer</th>
                <th className="px-4 py-3">Ventana</th>
                <th className="px-4 py-3">Estatus</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/reparto/pedidos/${r.id}`} className="hover:text-brand-carmesi">{r.numero_factura}</Link>
                    {r.prioridad && r.prioridad !== "normal" && (
                      <Badge variant="warning" className="ml-2 text-[10px]">{r.prioridad}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-3">
                    {r.clientes?.nombre ?? "—"}
                    {r.clientes?.ciudad && <div className="text-xs text-muted-foreground">{r.clientes.ciudad}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.chofer?.nombre ?? <span className="text-amber-700">sin asignar</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {r.ventana_inicio ? `${r.ventana_inicio.slice(0,5)}${r.ventana_fin ? ` – ${r.ventana_fin.slice(0,5)}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3"><Badge variant={ESTATUS_VARIANT[r.estatus]}>{ESTATUS_LABEL[r.estatus]}</Badge></td>
                  <td className="px-4 py-3 text-right">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/reparto/pedidos?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}>Anterior</Link>
            </Button>
          )}
          {page < totalPages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/reparto/pedidos?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}>Siguiente</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
