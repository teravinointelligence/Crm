import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Tránsito — TERAVINO CRM" };

const poStatusVariant: Record<string, "muted" | "warning" | "accent" | "success" | "danger"> = {
  borrador: "muted", enviada_proveedor: "warning", confirmada: "accent", facturada: "accent",
  en_transito: "warning", recibida_parcial: "warning", recibida: "success", cancelada: "danger",
};

export default async function TransitoPage() {
  const supabase = createClient();
  const admin = await isAdmin();

  const [{ data: transit }, { data: pos }] = await Promise.all([
    supabase.from("v_products_in_transit").select("*").order("earliest_eta", { ascending: true }),
    supabase.from("purchase_orders").select("id, po_number, supplier, status, order_date, expected_arrival_date, total, payment_status").order("order_date", { ascending: false }),
  ]);

  const transitRows = (transit ?? []) as Array<{ product_id: string | null; product_name: string; supplier: string; quantity_in_transit: number; earliest_eta: string | null; po_numbers: string[] | null }>;
  const poRows = (pos ?? []) as Array<{ id: string; po_number: string; supplier: string; status: string | null; order_date: string; expected_arrival_date: string | null; total: number | null; payment_status: string | null }>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Tránsito de productos</h1>
          <p className="text-sm text-muted-foreground">Qué viene en camino y de qué órdenes de compra.</p>
        </div>
        {admin && <Button asChild><Link href="/transito/nueva"><Plus className="mr-1 h-4 w-4" /> Nueva orden de compra</Link></Button>}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Qué viene en camino</h2>
        {transitRows.length === 0 ? (
          <EmptyState icon={Truck} title="Nada en tránsito" description="Cuando una OC se confirma o factura, el producto aparece aquí." />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3 text-right">En tránsito</th><th className="px-4 py-3">ETA</th><th className="px-4 py-3">OCs</th></tr></thead>
              <tbody>
                {transitRows.map((t, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{t.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.supplier}</td>
                    <td className="px-4 py-3 text-right">{t.quantity_in_transit}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.earliest_eta ? formatDate(t.earliest_eta) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{(t.po_numbers ?? []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Órdenes de compra</h2>
        {poRows.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Sin órdenes de compra todavía.</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">OC</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">ETA</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>
                {poRows.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium"><Link href={`/transito/${p.id}`} className="hover:text-brand-carmesi">{p.po_number}</Link></td>
                    <td className="px-4 py-3 text-muted-foreground">{p.supplier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.order_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.expected_arrival_date ? formatDate(p.expected_arrival_date) : "—"}</td>
                    <td className="px-4 py-3"><Badge variant={poStatusVariant[p.status ?? ""] ?? "muted"}>{p.status}</Badge></td>
                    <td className="px-4 py-3 text-right">{formatCurrency(p.total)}</td>
                    <td className="px-4 py-3 text-right"><Button asChild size="sm" variant="ghost"><Link href={`/transito/${p.id}`}>Ver</Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
