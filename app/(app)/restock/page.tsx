import Link from "next/link";
import { Plus, PackageCheck, PackagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Restock — TERAVINO CRM" };

const statusVariant: Record<string, "muted" | "warning" | "success" | "danger" | "accent"> = {
  borrador: "muted",
  enviada: "warning",
  aprobada: "success",
  rechazada: "danger",
  convertida_oc: "accent",
};

export default async function RestockPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const { data } = await supabase
    .from("restock_requests")
    .select("id, request_number, region_destino, status, created_at, sales_reps:sales_rep_id(full_name)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<{
    id: string; request_number: string; region_destino: string | null; status: string | null; created_at: string | null;
    sales_reps: { full_name: string | null } | null;
  }>;
  const pendingCount = rows.filter((r) => r.status === "enviada").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Pedidos de restock</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? `Bandeja de revisión${pendingCount ? ` · ${pendingCount} pendientes` : ""}`
              : "Tus solicitudes de producto al almacén."}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button asChild variant="outline">
              <Link href="/restock/consolidables"><PackagePlus className="mr-1 h-4 w-4" /> Consolidables por proveedor</Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/restock/nuevo"><Plus className="mr-1 h-4 w-4" /> Nuevo pedido de restock</Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Sin pedidos de restock" description="Crea tu primera solicitud de producto." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">Folio</th><th className="px-4 py-3">Vendedor</th><th className="px-4 py-3">Región</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium"><Link href={`/restock/${r.id}`} className="hover:text-brand-carmesi">{r.request_number}</Link></td>
                  <td className="px-4 py-3 text-muted-foreground">{r.sales_reps?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.region_destino ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant[r.status ?? ""] ?? "muted"}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-right"><Button asChild size="sm" variant="ghost"><Link href={`/restock/${r.id}`}>Ver</Link></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
