// Crédito de clientes (vista de Reparto). Lista a los clientes con cartera
// clasificados por estatus de crédito — Liberado / Por revisar / Suspender —
// para que logística decida a quién entregar. Es una vista OPERATIVA: a
// propósito NO muestra montos $, solo la clasificación de riesgo y los días
// vencidos. Acceso: admin y jefe de logística (ver canViewCreditoClientes).
//
// Como `jefe_logistica` no entra en can_read_all() (RLS solo deja ver sus
// cuentas asignadas), leemos con el service-role tras gatear por rol — mismo
// patrón que el resto de Reparto.

import { redirect } from "next/navigation";
import { ShieldCheck, AlertTriangle, CheckCircle2, Archive } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { canViewCreditoClientes, isRepartoOnlyRole } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clasificarRiesgo, type ClaseRiesgo } from "@/lib/cobranza";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { AccountBalance } from "@/types/database";

export const metadata = { title: "Crédito de clientes — Reparto" };
export const dynamic = "force-dynamic";

type AccountMeta = {
  id: string;
  business_name: string | null;
  client_number: string | null;
  region: string | null;
  assigned_rep_id: string | null;
  is_legacy: boolean | null;
  ventana_revision: number | null;
  ventana_suspension: number | null;
};

type Row = {
  accountId: string;
  nombre: string;
  clientNumber: string | null;
  region: string | null;
  vendedor: string | null;
  diasVencido: number | null;
  esSocio: boolean | null;
  clase: ClaseRiesgo;
  detalle: string;
};

export default async function CreditoClientesPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewCreditoClientes(rep.role)) {
    redirect(isRepartoOnlyRole(rep.role) ? "/reparto/dashboard" : "/");
  }

  const db = supabaseAdmin();
  const [{ data: balances }, { data: accounts }, { data: reps }] = await Promise.all([
    db
      .from("v_account_balance")
      .select(
        "account_id, business_name, region, assigned_rep_id, total_facturado, saldo_vencido, dias_vencido, es_socio",
      ),
    db
      .from("accounts")
      .select(
        "id, business_name, client_number, region, assigned_rep_id, is_legacy, ventana_revision, ventana_suspension",
      ),
    db.from("sales_reps").select("id, full_name"),
  ]);

  const acctMeta = new Map(
    ((accounts ?? []) as AccountMeta[]).map((a) => [a.id, a]),
  );
  const repName = new Map(
    ((reps ?? []) as { id: string; full_name: string | null }[]).map((r) => [r.id, r.full_name]),
  );

  // Universo: clientes con cartera (igual que la página de Cartera).
  const rows: Row[] = ((balances ?? []) as AccountBalance[])
    .filter((b) => (b.total_facturado ?? 0) > 0)
    .map((b) => {
      const meta = acctMeta.get(b.account_id);
      const riesgo = clasificarRiesgo({
        diasVencido: b.dias_vencido,
        saldoVencido: b.saldo_vencido,
        isLegacy: meta?.is_legacy,
        ventanaRevision: meta?.ventana_revision,
        ventanaSuspension: meta?.ventana_suspension,
      });
      return {
        accountId: b.account_id,
        nombre: b.business_name ?? meta?.business_name ?? "—",
        clientNumber: meta?.client_number ?? null,
        region: b.region ?? meta?.region ?? null,
        vendedor: b.assigned_rep_id ? repName.get(b.assigned_rep_id) ?? null : null,
        diasVencido: b.dias_vencido,
        esSocio: b.es_socio,
        clase: riesgo.clase,
        detalle: riesgo.detalle,
      };
    });

  const byClass = (clase: ClaseRiesgo) =>
    rows
      .filter((r) => r.clase === clase)
      .sort((a, b) => (b.diasVencido ?? 0) - (a.diasVencido ?? 0));

  const suspender = byClass("Suspender Crédito");
  const porRevisar = byClass("Por Revisar");
  const liberado = byClass("Crédito Liberado");
  const legacy = byClass("Cartera Legacy");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Crédito de clientes</h1>
        <p className="text-sm text-muted-foreground">
          Estatus de crédito por cliente para decidir entregas. No muestra montos:
          solo la clasificación de riesgo y los días vencidos.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Suspender crédito" value={suspender.length} tone="danger" />
        <Kpi label="Por revisar" value={porRevisar.length} tone="warning" />
        <Kpi label="Crédito liberado" value={liberado.length} tone="ok" />
        <Kpi label="Cartera legacy" value={legacy.length} tone="muted" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin cartera aún"
          description="No hay clientes con facturas cargadas todavía."
        />
      ) : (
        <div className="space-y-6">
          <Section
            title="Suspender crédito — NO entregar"
            description="Saldo vencido más allá de la ventana de revisión. Confirmar con dirección antes de entregar."
            icon={<ShieldCheck className="h-5 w-5 text-red-700" />}
            rows={suspender}
            variant="danger"
          />
          <Section
            title="Por revisar"
            description="Saldo vencido dentro de la ventana de revisión. Entregar con precaución."
            icon={<AlertTriangle className="h-5 w-5 text-amber-700" />}
            rows={porRevisar}
            variant="warning"
          />
          <Section
            title="Crédito liberado — OK entregar"
            description="Al corriente o sin saldo vencido material."
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
            rows={liberado}
            variant="success"
          />
          {legacy.length > 0 && (
            <Section
              title="Cartera legacy"
              description="Cuentas legacy/estratégicas, excluidas de la lógica de suspensión."
              icon={<Archive className="h-5 w-5 text-muted-foreground" />}
              rows={legacy}
              variant="muted"
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  icon,
  rows,
  variant,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  rows: Row[];
  variant: "danger" | "warning" | "success" | "muted";
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {icon}
          <div>
            <h2 className="font-display text-lg">
              {title}{" "}
              <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
            </h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Sin clientes en este estatus.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Región</th>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2 text-right">Días vencido</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.accountId} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.nombre}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {r.clientNumber && (
                          <span className="text-xs text-muted-foreground"># {r.clientNumber}</span>
                        )}
                        {r.esSocio && (
                          <Badge variant="warning" className="text-[10px]">Socio</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.region ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.vendedor ?? "—"}</td>
                    <td
                      className={`px-4 py-2 text-right ${
                        variant === "danger"
                          ? "font-medium text-red-700"
                          : variant === "warning"
                            ? "text-amber-700"
                            : "text-muted-foreground"
                      }`}
                    >
                      {(r.diasVencido ?? 0) > 0 ? `${r.diasVencido} días` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "ok" | "muted";
}) {
  const cls =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`font-display text-2xl ${cls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
