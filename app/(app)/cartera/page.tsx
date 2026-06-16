import Link from "next/link";
import { Upload, Download, Landmark, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CarteraTable, type CarteraRow } from "@/components/cartera/CarteraTable";
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

  // Filas enriquecidas para la tabla (buscador + paginación viven en el cliente).
  const carteraRows: CarteraRow[] = rows.map((b) => ({
    accountId: b.account_id,
    businessName: b.business_name,
    clientNumber: clientNum.get(b.account_id) ?? null,
    region: b.region,
    vendedor: b.assigned_rep_id ? repName.get(b.assigned_rep_id) ?? null : null,
    esSocio: b.es_socio,
    totalFacturado: b.total_facturado,
    totalPagado: b.total_pagado,
    saldoPendiente: b.saldo_pendiente,
    saldoVencido: b.saldo_vencido,
    diasVencido: b.dias_vencido,
    facturasAbiertas: b.facturas_abiertas,
  }));

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
            <Button asChild>
              <Link href="/cartera/cobranza">
                <ListChecks className="mr-1 h-4 w-4" /> Cobranza de hoy
              </Link>
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
        <CarteraTable rows={carteraRows} />
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
