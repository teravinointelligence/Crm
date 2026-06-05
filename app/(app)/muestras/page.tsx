import Link from "next/link";
import { Plus, FlaskConical, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Muestras — TERAVINO CRM" };

const statusVariant: Record<string, "muted" | "warning" | "success" | "danger" | "accent"> = {
  borrador: "muted",
  enviada: "warning",
  aprobada: "accent",
  entregada: "success",
  rechazada: "danger",
};

export default async function MuestrasPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const { data } = await supabase
    .from("sample_requests")
    .select("id, request_number, reason, status, created_at, account_id, sales_reps:sales_rep_id(full_name), accounts:account_id(business_name, client_number)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<{
    id: string; request_number: string; reason: string | null; status: string | null; created_at: string | null; account_id: string | null;
    sales_reps: { full_name: string | null } | null;
    accounts: { business_name: string | null; client_number: string | null } | null;
  }>;
  const pendientes = rows.filter((r) => r.status === "enviada").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Muestras solicitadas</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? `Botellas de muestra pedidas por los vendedores${pendientes ? ` · ${pendientes} por revisar` : ""}`
              : "Tus solicitudes de botellas para catas / clientes."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/muestras/banco"><Package className="mr-1 h-4 w-4" /> Banco de muestras</Link>
          </Button>
          <Button asChild>
            <Link href="/muestras/nueva"><Plus className="mr-1 h-4 w-4" /> Solicitar muestras</Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="Sin solicitudes de muestras"
          description="Cuando un vendedor pida botellas para una cata aparecerán aquí."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/muestras/${r.id}`} className="hover:text-brand-carmesi">{r.request_number}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.sales_reps?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.accounts?.business_name ?? "—"}
                    {r.accounts?.client_number && (
                      <div className="text-xs"># {r.accounts.client_number}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant[r.status ?? ""] ?? "muted"}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-right"><Button asChild size="sm" variant="ghost"><Link href={`/muestras/${r.id}`}>Ver</Link></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
