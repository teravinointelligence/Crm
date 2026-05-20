// Listado de consignaciones de Base44 (TERAVINO Flow), filtrable por estado.
// Scope: admin ve todo, vendedor ve solo las suyas (match por email).

import Link from "next/link";
import { Wine, Filter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Consignacion,
} from "@/lib/base44";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RetiroDialog } from "@/components/consignaciones/RetiroDialog";

export const metadata = { title: "Consignaciones — TERAVINO CRM" };
export const dynamic = "force-dynamic";

type Estado = Base44Consignacion["estado"];
const ESTADOS: Estado[] = ["pendiente", "parcial", "liquidada", "devuelta"];

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  liquidada: "Liquidada",
  devuelta: "Devuelta",
};

const ESTADO_VARIANT: Record<Estado, "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"> = {
  pendiente: "warning",
  parcial: "accent",
  liquidada: "success",
  devuelta: "danger",
};

export default async function ConsignacionesPage({
  searchParams,
}: {
  searchParams: { estado?: string };
}) {
  const rep = await requireRep();
  const isAdmin = rep.role === "admin";
  const estadoParam = (searchParams.estado ?? "") as Estado | "";

  // Scope por vendedor — si el rep no tiene match en Base44, mostramos empty state.
  let scopeVendedorId: string | null = null;
  if (!isAdmin) {
    const v = await resolveBase44Vendedor(rep.email);
    if (!v) {
      return <NoVendedorMatch email={rep.email} />;
    }
    scopeVendedorId = v.id;
  }

  // Query Base44
  const query: Record<string, unknown> = {};
  if (scopeVendedorId) query.vendedor_id = scopeVendedorId;
  if (estadoParam && ESTADOS.includes(estadoParam as Estado)) query.estado = estadoParam;

  let consignaciones: Base44Consignacion[] = [];
  let loadError: string | null = null;
  try {
    consignaciones = await base44.entity<Base44Consignacion>("Consignacion").list({
      q: query,
      sort_by: "-fecha",
      limit: 200,
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // Cruzamos con accounts del CRM por numero_cliente para enlazar a la ficha.
  // Base44 acepta MongoDB-style $in, así que traemos todos los clientes con una sola request.
  const supabase = createClient();
  const clienteIds = Array.from(new Set(consignaciones.map((c) => c.cliente_id)));
  const accountByClienteId = new Map<string, { id: string; business_name: string }>();
  if (clienteIds.length) {
    try {
      const clientes = await base44
        .entity<{ id: string; numero_cliente?: string }>("Cliente")
        .list({ q: { id: { $in: clienteIds } }, limit: clienteIds.length });
      const numeroByClienteId = new Map<string, string>();
      const numeros: string[] = [];
      for (const c of clientes) {
        if (c.numero_cliente) {
          numeroByClienteId.set(c.id, c.numero_cliente);
          numeros.push(c.numero_cliente);
        }
      }
      if (numeros.length) {
        const { data: accounts } = await supabase
          .from("accounts")
          .select("id, business_name, client_number")
          .in("client_number", numeros);
        const accountByNumber = new Map<string, { id: string; business_name: string }>();
        for (const a of accounts ?? []) {
          if (a.client_number) accountByNumber.set(a.client_number, { id: a.id, business_name: a.business_name });
        }
        for (const [clienteId, numero] of numeroByClienteId) {
          const acc = accountByNumber.get(numero);
          if (acc) accountByClienteId.set(clienteId, acc);
        }
      }
    } catch {
      // Si falla el cruce con accounts, el listado sigue funcionando sin links.
    }
  }

  const totales = consignaciones.reduce(
    (acc, c) => {
      acc.total += c.total ?? 0;
      acc.cobrado += c.monto_cobrado ?? 0;
      return acc;
    },
    { total: 0, cobrado: 0 },
  );
  const saldoAbierto = totales.total - totales.cobrado;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Consignaciones</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? `Todas las consignaciones de TERAVINO Flow (${consignaciones.length}).`
              : `Tus consignaciones activas (${consignaciones.length}).`}
          </p>
        </div>
        <Button asChild>
          <Link href="/consignaciones/nueva">
            <Plus className="mr-1 h-4 w-4" />
            Nueva consignación
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Estado:</span>
          <FilterPill href="/consignaciones" active={!estadoParam} label="Todos" />
          {ESTADOS.map((e) => (
            <FilterPill
              key={e}
              href={`/consignaciones?estado=${e}`}
              active={estadoParam === e}
              label={ESTADO_LABEL[e]}
            />
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total consignado" value={formatCurrency(totales.total)} />
        <StatCard label="Total cobrado" value={formatCurrency(totales.cobrado)} />
        <StatCard label="Saldo abierto" value={formatCurrency(saldoAbierto)} highlight />
      </div>

      {loadError ? (
        <EmptyState
          icon={Wine}
          title="No pudimos cargar las consignaciones"
          description={
            loadError.includes("BASE44_API_KEY")
              ? "Falta configurar BASE44_API_KEY en Vercel."
              : loadError
          }
        />
      ) : consignaciones.length === 0 ? (
        <EmptyState
          icon={Wine}
          title="Sin consignaciones"
          description={
            estadoParam
              ? `No hay consignaciones en estado "${ESTADO_LABEL[estadoParam as Estado]}".`
              : "Aún no hay consignaciones registradas en TERAVINO Flow."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    {isAdmin && <th className="px-4 py-2 text-left">Vendedor</th>}
                    <th className="px-4 py-2 text-left">Chofer</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Cobrado</th>
                    <th className="px-4 py-2 text-right">Saldo</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-center">Retiro</th>
                  </tr>
                </thead>
                <tbody>
                  {consignaciones.map((c) => {
                    const linked = accountByClienteId.get(c.cliente_id);
                    const saldo = (c.total ?? 0) - (c.monto_cobrado ?? 0);
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Link href={`/consignaciones/${c.id}`} className="text-brand-carmesi hover:underline">
                            {formatDate(c.fecha)}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          {linked ? (
                            <Link href={`/cuentas/${linked.id}`} className="hover:underline">
                              {c.cliente_nombre ?? linked.business_name}
                            </Link>
                          ) : (
                            <span>{c.cliente_nombre ?? "—"}</span>
                          )}
                        </td>
                        {isAdmin && <td className="px-4 py-2">{c.vendedor_nombre ?? "—"}</td>}
                        <td className="px-4 py-2 text-muted-foreground">{c.chofer_nombre ?? "—"}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">{formatCurrency(c.total)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">{formatCurrency(c.monto_cobrado)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap font-medium">{formatCurrency(saldo)}</td>
                        <td className="px-4 py-2">
                          <Badge variant={ESTADO_VARIANT[c.estado]}>{ESTADO_LABEL[c.estado]}</Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {c.estado === "pendiente" || c.estado === "parcial" ? (
                            <RetiroDialog consignacion={c} compact />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-brand-carmesi px-3 py-1 text-xs font-medium text-white"
          : "rounded-full bg-muted px-3 py-1 text-xs text-foreground/70 hover:bg-muted/70"
      }
    >
      {label}
    </Link>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={highlight ? "font-display text-2xl text-brand-carmesi" : "font-display text-2xl"}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function NoVendedorMatch({ email }: { email: string }) {
  return (
    <EmptyState
      icon={Wine}
      title="Tu usuario no está enlazado a un vendedor en TERAVINO Flow"
      description={`No encontré un Vendedor con email "${email}" en Base44. Pídele a un admin que dé de alta tu correo en TERAVINO Flow, o sincroniza los emails entre ambos sistemas.`}
    />
  );
}
