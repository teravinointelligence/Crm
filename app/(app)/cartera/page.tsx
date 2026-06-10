import Link from "next/link";
import { Upload, Download, Landmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SemaforoBadge } from "@/components/cartera/SemaforoBadge";
import { CobranzaEmails } from "@/components/cartera/CobranzaEmails";
import { formatCurrency } from "@/lib/utils";
import type { AccountBalance } from "@/types/database";

export const metadata = { title: "Cartera — TERAVINO CRM" };

export default async function CarteraPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";
  const finance = canSeeFinance(rep?.role);

  const [{ data: balances }, { data: reps }, { data: accts }] = await Promise.all([
    supabase
      .from("v_account_balance")
      .select("*")
      .order("saldo_vencido", { ascending: false })
      .order("saldo_pendiente", { ascending: false }),
    supabase.from("sales_reps").select("id, full_name"),
    supabase.from("accounts").select("id, client_number"),
  ]);

  const repName = new Map((reps ?? []).map((r) => [r.id, r.full_name]));
  const clientNum = new Map(
    ((accts ?? []) as { id: string; client_number: string | null }[]).map((a) => [
      a.id,
      a.client_number,
    ]),
  );
  const rows = ((balances ?? []) as AccountBalance[]).filter(
    (b) => (b.total_facturado ?? 0) > 0,
  );

  const totals = rows.reduce(
    (acc, b) => {
      acc.facturado += b.total_facturado ?? 0;
      acc.pagado += b.total_pagado ?? 0;
      acc.pendiente += b.saldo_pendiente ?? 0;
      acc.vencido += b.saldo_vencido ?? 0;
      return acc;
    },
    { facturado: 0, pagado: 0, pendiente: 0, vencido: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Cartera de clientes</h1>
          <p className="text-sm text-muted-foreground">
            Estado de cuenta por cliente — facturas y pagos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.length > 0 && <CobranzaEmails rows={rows} />}
          {rows.length > 0 && (
            <Button asChild variant="outline">
              <a href="/api/cartera/export">
                <Download className="mr-1 h-4 w-4" /> Descargar Excel
              </a>
            </Button>
          )}
          {finance && (
            <Button asChild variant="outline">
              <Link href="/cartera/conciliacion">
                <Landmark className="mr-1 h-4 w-4" /> Conciliación bancaria
              </Link>
            </Button>
          )}
          {isAdmin && (
            <Button asChild variant="outline">
              <Link href="/cartera/importar">
                <Upload className="mr-1 h-4 w-4" /> Importar facturas / pagos
              </Link>
            </Button>
          )}
          {isAdmin && (
            <Button asChild variant="outline">
              <a href="/api/cartera/auditoria-sin-pagos">
                <Download className="mr-1 h-4 w-4" /> Auditoría: cuentas sin pagos
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total facturado" value={formatCurrency(totals.facturado)} />
        <KpiCard label="Total pagado" value={formatCurrency(totals.pagado)} />
        <KpiCard label="Saldo pendiente" value={formatCurrency(totals.pendiente)} accent />
        <KpiCard label="Saldo vencido" value={formatCurrency(totals.vencido)} danger />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin cartera aún"
          description="Importa las facturas históricas (CONTPAQi) desde Excel para empezar."
          action={
            isAdmin ? (
              <Button asChild className="mt-2">
                <Link href="/cartera/importar">
                  <Upload className="mr-1 h-4 w-4" /> Importar facturas / pagos
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Región</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3 text-right">Facturado</th>
                <th className="px-4 py-3 text-right">Pagado</th>
                <th className="px-4 py-3 text-right">Pendiente</th>
                <th className="px-4 py-3 text-right">Vencido</th>
                <th className="px-4 py-3 text-center">Facturas</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.account_id}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/cartera/${b.account_id}`}
                      className="font-medium hover:text-brand-carmesi"
                    >
                      {b.business_name}
                    </Link>
                    {b.es_socio && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Socio · sin vencido
                      </span>
                    )}
                    {clientNum.get(b.account_id) && (
                      <div className="text-xs text-muted-foreground">
                        # {clientNum.get(b.account_id)}
                      </div>
                    )}
                    <div className="mt-1">
                      <SemaforoBadge
                        saldoPendiente={b.saldo_pendiente ?? 0}
                        saldoVencido={b.saldo_vencido ?? 0}
                        diasVencido={b.dias_vencido}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.region ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.assigned_rep_id ? repName.get(b.assigned_rep_id) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(b.total_facturado)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatCurrency(b.total_pagado)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(b.saldo_pendiente)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      (b.saldo_vencido ?? 0) > 0 ? "font-medium text-red-600" : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrency(b.saldo_vencido)}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {b.facturas_abiertas ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/cartera/${b.account_id}`}>Estado de cuenta</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={`font-display text-2xl ${
            danger ? "text-red-600" : accent ? "text-brand-carmesi" : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
