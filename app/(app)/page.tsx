import Link from "next/link";
import {
  Building2,
  CalendarCheck2,
  FileText,
  TrendingUp,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Activity } from "@/types/database";

export const metadata = { title: "Dashboard — TERAVINO CRM" };

export default async function DashboardPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) return null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString();
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const todayISO = new Date().toISOString().slice(0, 10);

  const [
    accountsActiveRes,
    activitiesMonthRes,
    pipelineRes,
    closedMonthRes,
    upcomingRes,
    topRes,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "activo"),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .gte("activity_date", monthStartISO),
    supabase
      .from("orders")
      .select("total")
      .eq("order_type", "cotizacion")
      .in("status", ["borrador", "enviada"]),
    supabase
      .from("orders")
      .select("total")
      .in("status", ["aceptada", "facturada", "entregada"])
      .gte("order_date", monthStartISO.slice(0, 10)),
    supabase
      .from("activities")
      .select("*, accounts:account_id(business_name)")
      .gte("next_step_date", todayISO)
      .lte("next_step_date", sevenDaysOut.toISOString().slice(0, 10))
      .order("next_step_date", { ascending: true })
      .limit(10),
    supabase
      .from("orders")
      .select(
        "account_id, total, accounts:account_id(business_name, region)",
      )
      .in("status", ["aceptada", "facturada", "entregada"])
      .gte("order_date", monthStartISO.slice(0, 10)),
  ]);

  const pipelineTotal = (pipelineRes.data ?? []).reduce(
    (sum, o) => sum + Number(o.total ?? 0),
    0,
  );
  const closedTotal = (closedMonthRes.data ?? []).reduce(
    (sum, o) => sum + Number(o.total ?? 0),
    0,
  );

  const topMap = new Map<string, { name: string; region: string | null; total: number }>();
  for (const o of (topRes.data ?? []) as unknown as Array<{
    account_id: string;
    total: number | null;
    accounts: { business_name: string | null; region: string | null } | null;
  }>) {
    if (!o.account_id) continue;
    const entry = topMap.get(o.account_id) ?? {
      name: o.accounts?.business_name ?? "—",
      region: o.accounts?.region ?? null,
      total: 0,
    };
    entry.total += Number(o.total ?? 0);
    topMap.set(o.account_id, entry);
  }
  const topAccounts = Array.from(topMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            Hola, {rep.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {rep.role === "admin"
              ? "Vista de dirección · todas las regiones"
              : `Tu cartera en ${rep.primary_region ?? "tu región"}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/actividades/nueva">
              <Plus className="mr-1 h-4 w-4" /> Visita
            </Link>
          </Button>
          <Button asChild variant="accent">
            <Link href="/pedidos/nuevo">
              <Plus className="mr-1 h-4 w-4" /> Cotización
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Cuentas activas"
          value={accountsActiveRes.count?.toLocaleString("es-MX") ?? "0"}
        />
        <KpiCard
          icon={CalendarCheck2}
          label="Actividades del mes"
          value={activitiesMonthRes.count?.toLocaleString("es-MX") ?? "0"}
        />
        <KpiCard
          icon={FileText}
          label="Pipeline en cotizaciones"
          value={formatCurrency(pipelineTotal)}
        />
        <KpiCard
          icon={TrendingUp}
          label="Cerrado este mes"
          value={formatCurrency(closedTotal)}
          accent
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-display text-xl">Próximos pasos (7 días)</h2>
          {upcomingRes.data?.length ? (
            <ActivityTimeline
              activities={(upcomingRes.data ?? []) as Activity[]}
              showAccount
            />
          ) : (
            <EmptyState
              icon={CalendarCheck2}
              title="Sin pendientes próximos"
              description="Cuando registres actividades con un siguiente paso aparecerán aquí."
            />
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-xl">Top cuentas del mes</h2>
          {topAccounts.length ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                {topAccounts.map((a, idx) => (
                  <Link
                    key={a.id}
                    href={`/cuentas/${a.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 hover:border-brand-carmesi"
                  >
                    <div>
                      <div className="text-xs text-muted-foreground">
                        #{idx + 1}
                      </div>
                      <div className="font-medium">{a.name}</div>
                      {a.region && (
                        <Badge variant="muted" className="mt-1">
                          {a.region}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-display text-brand-carmesi">
                        {formatCurrency(a.total)}
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="Aún sin ventas"
              description="Las cuentas con pedidos cerrados aparecerán aquí."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div
            className={`font-display text-2xl ${
              accent ? "text-brand-carmesi" : ""
            }`}
          >
            {value}
          </div>
        </div>
        <div className="rounded-full bg-accent/20 p-2 text-brand-carmesi">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
