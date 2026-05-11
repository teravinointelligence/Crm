import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SupplierPaymentDialog } from "@/components/transito/SupplierPaymentDialog";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Cuentas por pagar — TERAVINO CRM" };

export default async function CuentasPagarPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep || rep.role !== "admin") redirect("/");

  const [{ data: balances }, { data: pos }] = await Promise.all([
    supabase.from("v_supplier_balance").select("*").order("saldo_vencido", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select("id, po_number, supplier, supplier_invoice_number, supplier_invoice_date, supplier_invoice_due_date, total, total_paid, balance, payment_status")
      .not("supplier_invoice_number", "is", null)
      .neq("status", "cancelada")
      .order("supplier_invoice_due_date", { ascending: true }),
  ]);

  const bRows = (balances ?? []) as Array<{ supplier: string; facturas_abiertas: number | null; total_facturado: number | null; total_pagado: number | null; saldo_pendiente: number | null; saldo_vencido: number | null }>;
  const pRows = (pos ?? []) as Array<{ id: string; po_number: string; supplier: string; supplier_invoice_number: string | null; supplier_invoice_date: string | null; supplier_invoice_due_date: string | null; total: number | null; total_paid: number | null; balance: number | null; payment_status: string | null }>;

  const totals = bRows.reduce((a, b) => { a.fact += b.total_facturado ?? 0; a.pag += b.total_pagado ?? 0; a.pend += b.saldo_pendiente ?? 0; a.venc += b.saldo_vencido ?? 0; return a; }, { fact: 0, pag: 0, pend: 0, venc: 0 });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Cuentas por pagar</h1>
        <p className="text-sm text-muted-foreground">Saldos con proveedores y registro de pagos. Solo dirección.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Facturado" value={formatCurrency(totals.fact)} />
        <Kpi label="Pagado" value={formatCurrency(totals.pag)} />
        <Kpi label="Saldo pendiente" value={formatCurrency(totals.pend)} accent />
        <Kpi label="Saldo vencido" value={formatCurrency(totals.venc)} danger />
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Por proveedor</h2>
        {bRows.length === 0 ? (
          <EmptyState title="Sin facturas de proveedor" description="Carga la factura del proveedor desde el detalle de una OC en Tránsito." />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3 text-center">Facturas abiertas</th><th className="px-4 py-3 text-right">Facturado</th><th className="px-4 py-3 text-right">Pagado</th><th className="px-4 py-3 text-right">Pendiente</th><th className="px-4 py-3 text-right">Vencido</th></tr></thead>
              <tbody>
                {bRows.map((b) => (
                  <tr key={b.supplier} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{b.supplier}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{b.facturas_abiertas ?? 0}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(b.total_facturado)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(b.total_pagado)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(b.saldo_pendiente)}</td>
                    <td className={`px-4 py-3 text-right ${(b.saldo_vencido ?? 0) > 0 ? "font-medium text-red-600" : "text-muted-foreground"}`}>{formatCurrency(b.saldo_vencido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Facturas de proveedores</h2>
        {pRows.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Aún no hay facturas de proveedores cargadas.</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">OC</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Folio factura</th><th className="px-4 py-3">Vence</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Pagado</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>
                {pRows.map((p) => {
                  const overdue = p.supplier_invoice_due_date && new Date(p.supplier_invoice_due_date) < new Date() && (p.balance ?? 0) > 0;
                  return (
                    <tr key={p.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium"><Link href={`/transito/${p.id}`} className="hover:text-brand-carmesi">{p.po_number}</Link></td>
                      <td className="px-4 py-3 text-muted-foreground">{p.supplier}</td>
                      <td className="px-4 py-3">{p.supplier_invoice_number}</td>
                      <td className={`px-4 py-3 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>{p.supplier_invoice_due_date ? formatDate(p.supplier_invoice_due_date) : "—"}</td>
                      <td className="px-4 py-3"><Badge variant={p.payment_status === "pagada" ? "success" : p.payment_status === "vencida" ? "danger" : "warning"}>{p.payment_status}</Badge></td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.total)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(p.total_paid)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.balance)}</td>
                      <td className="px-4 py-3 text-right">
                        {(p.balance ?? 0) > 0 && <SupplierPaymentDialog poId={p.id} poNumber={p.po_number} repId={rep.id} balance={Number(p.balance ?? 0)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <Card><CardContent className="space-y-1 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl ${danger ? "text-red-600" : accent ? "text-brand-carmesi" : ""}`}>{value}</div>
    </CardContent></Card>
  );
}
