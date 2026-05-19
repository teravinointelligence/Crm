// Detalle de una consignación (read-only). Acceso: admin siempre, vendedor solo
// si la consignación es suya (match por email → vendedor_id en Base44).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wine, Truck, User as UserIcon, Calendar, FileText } from "lucide-react";
import { requireRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Cliente,
  type Base44Consignacion,
} from "@/lib/base44";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<Base44Consignacion["estado"], string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  liquidada: "Liquidada",
  devuelta: "Devuelta",
};

const ESTADO_VARIANT: Record<Base44Consignacion["estado"], "default" | "outline" | "accent" | "success" | "warning" | "danger" | "muted"> = {
  pendiente: "warning",
  parcial: "accent",
  liquidada: "success",
  devuelta: "danger",
};

export default async function ConsignacionDetailPage({ params }: { params: { id: string } }) {
  const rep = await requireRep();
  const isAdmin = rep.role === "admin";

  let consignacion: Base44Consignacion;
  try {
    consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(params.id);
  } catch {
    notFound();
  }

  // Scope: si no es admin, la consignación debe ser de su vendedor.
  if (!isAdmin) {
    const v = await resolveBase44Vendedor(rep.email);
    if (!v || v.id !== consignacion.vendedor_id) {
      notFound();
    }
  }

  // Cliente Base44 → numero_cliente → CRM account
  let cliente: Base44Cliente | null = null;
  try {
    cliente = await base44.entity<Base44Cliente>("Cliente").get(consignacion.cliente_id);
  } catch {
    cliente = null;
  }

  const supabase = createClient();
  let crmAccount: { id: string; business_name: string } | null = null;
  if (cliente?.numero_cliente) {
    const { data } = await supabase
      .from("accounts")
      .select("id, business_name")
      .eq("client_number", cliente.numero_cliente)
      .maybeSingle();
    if (data) crmAccount = data;
  }

  const saldo = (consignacion.total ?? 0) - (consignacion.monto_cobrado ?? 0);
  const items = consignacion.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/consignaciones">
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1">Volver</span>
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            {consignacion.cliente_nombre ?? "Consignación"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Folio interno Base44: <code className="text-xs">{consignacion.id}</code>
          </p>
        </div>
        <Badge variant={ESTADO_VARIANT[consignacion.estado]} className="text-sm">
          {ESTADO_LABEL[consignacion.estado]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <InfoCard icon={Calendar} label="Fecha" value={formatDate(consignacion.fecha)} />
        <InfoCard icon={UserIcon} label="Vendedor" value={consignacion.vendedor_nombre ?? "—"} />
        <InfoCard icon={Truck} label="Chofer" value={consignacion.chofer_nombre ?? "Sin asignar"} />
      </div>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-display text-lg">Cliente</h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Nombre comercial</p>
              <p>{cliente?.nombre ?? consignacion.cliente_nombre ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground"># cliente CONTPAQ i</p>
              <p>{cliente?.numero_cliente ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Razón social</p>
              <p>{cliente?.razon_social ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Locación</p>
              <p>{cliente?.locacion ?? "—"}</p>
            </div>
          </div>
          {crmAccount && (
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/cuentas/${crmAccount.id}`}>
                  Ver ficha en el CRM →
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h2 className="font-display text-lg">Productos consignados</h2>
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Esta consignación no tiene items cargados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Producto</th>
                    <th className="px-4 py-2 text-right">Cantidad</th>
                    <th className="px-4 py-2 text-right">Precio unit.</th>
                    <th className="px-4 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={`${it.producto_id}-${i}`} className="border-t">
                      <td className="px-4 py-2">{it.producto_nombre}</td>
                      <td className="px-4 py-2 text-right">{it.cantidad}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(it.precio_unitario)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <InfoCard icon={Wine} label="Total" value={formatCurrency(consignacion.total)} />
        <InfoCard icon={Wine} label="Unidades vendidas" value={String(consignacion.cantidad_vendida ?? 0)} />
        <InfoCard icon={Wine} label="Unidades devueltas" value={String(consignacion.cantidad_devuelta ?? 0)} />
        <InfoCard icon={Wine} label="Monto cobrado" value={formatCurrency(consignacion.monto_cobrado)} />
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Saldo abierto</p>
            <p className="font-display text-3xl text-brand-carmesi">{formatCurrency(saldo)}</p>
          </div>
          <Badge variant={ESTADO_VARIANT[consignacion.estado]}>
            {ESTADO_LABEL[consignacion.estado]}
          </Badge>
        </CardContent>
      </Card>

      {consignacion.notas && (
        <Card>
          <CardContent className="space-y-2 p-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              <span>Notas</span>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{consignacion.notas}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <p className="font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}
