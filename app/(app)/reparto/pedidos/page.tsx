// Listado de pedidos de Reparto con filtros (estatus, chofer, fechas, búsqueda).

import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { canViewReparto, canManageReparto } from "@/lib/modules";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PedidosFilters } from "@/components/reparto/PedidosFilters";
import { UploadCFDI } from "@/components/reparto/UploadCFDI";
import { ESTATUS_LABEL, ESTATUS_VARIANT, TIPO_BADGE, type PedidoEstatus, type PedidoTipo } from "@/types/reparto";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Pedidos — Reparto" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  numero_factura: string;
  tipo: PedidoTipo | null;
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
  if (!canViewReparto(rep.role)) redirect("/");
  const canManage = canManageReparto(rep.role);

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const limit = 50;
  const fromIdx = (page - 1) * limit;
  const toIdx = fromIdx + limit - 1;

  let query = repartoAdmin
    .from("pedidos")
    .select(
      "id, numero_factura, tipo, fecha, ventana_inicio, ventana_fin, estatus, prioridad, total, direccion_entrega, clientes:cliente_id(id, nombre, ciudad, rfc), chofer:chofer_id(id, nombre)",
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

  // Número de cliente CONTPAQi (accounts.client_number) por cliente de Reparto.
  // No hay FK: se cruza por RFC (excluyendo los genéricos del SAT, que
  // comparten muchas cuentas) con respaldo por nombre exacto.
  const RFC_GENERICOS = ["XAXX010101000", "XEXX010101000"];
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const clienteNumero: Record<string, string> = {};
  if (rows.some((r) => r.clientes)) {
    try {
      const { data: accts } = await supabaseAdmin()
        .from("accounts")
        .select("rfc, business_name, client_number")
        .not("client_number", "is", null);
      const byRfc = new Map<string, string>();
      const byNombre = new Map<string, string>();
      for (const a of (accts ?? []) as { rfc: string | null; business_name: string; client_number: string }[]) {
        const rfc = (a.rfc ?? "").trim().toUpperCase();
        if (rfc && !RFC_GENERICOS.includes(rfc) && !byRfc.has(rfc)) byRfc.set(rfc, a.client_number);
        const nombre = norm(a.business_name);
        if (nombre && !byNombre.has(nombre)) byNombre.set(nombre, a.client_number);
      }
      for (const r of rows) {
        if (!r.clientes || clienteNumero[r.clientes.id]) continue;
        const rfc = (r.clientes.rfc ?? "").trim().toUpperCase();
        const num =
          (rfc && !RFC_GENERICOS.includes(rfc) ? byRfc.get(rfc) : undefined) ??
          byNombre.get(norm(r.clientes.nombre));
        if (num) clienteNumero[r.clientes.id] = num;
      }
    } catch {
      // Sin service-role local, la lista funciona sin el número de cliente.
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Pedidos de reparto</h1>
          <p className="text-sm text-muted-foreground">Asignación, ventana horaria y seguimiento.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <UploadCFDI />
            <Button asChild>
              <Link href="/reparto/pedidos/nuevo"><Plus className="mr-1 h-4 w-4" /> Nuevo pedido</Link>
            </Button>
          </div>
        )}
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
                    {r.tipo && r.tipo !== "factura" && (
                      <Badge variant="accent" className="ml-2 text-[10px]">{TIPO_BADGE[r.tipo]}</Badge>
                    )}
                    {r.prioridad && r.prioridad !== "normal" && (
                      <Badge variant="warning" className="ml-2 text-[10px]">{r.prioridad}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-3">
                    {r.clientes?.nombre ?? "—"}
                    {r.clientes && (clienteNumero[r.clientes.id] || r.clientes.ciudad) && (
                      <div className="text-xs text-muted-foreground">
                        {[
                          clienteNumero[r.clientes.id] ? `# ${clienteNumero[r.clientes.id]}` : null,
                          r.clientes.ciudad,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
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
