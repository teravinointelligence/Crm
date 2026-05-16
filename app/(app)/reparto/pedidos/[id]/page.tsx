// Detalle de un pedido: stepper de progreso, partidas, evidencias y acciones.

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, MessageCircle, FileText } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PedidoStepper } from "@/components/reparto/PedidoStepper";
import { PedidoActions } from "@/components/reparto/PedidoActions";
import { ESTATUS_LABEL, ESTATUS_VARIANT, type PedidoEstatus, type Prioridad } from "@/types/reparto";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Detail = {
  id: string;
  numero_factura: string;
  uuid_fiscal: string | null;
  fecha: string;
  ventana_inicio: string | null;
  ventana_fin: string | null;
  estatus: PedidoEstatus;
  prioridad: Prioridad | null;
  origen: string;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  moneda: string | null;
  direccion_entrega: string | null;
  notas: string | null;
  motivo_problema: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  created_at: string | null;
  cliente_id: string | null;
  chofer_id: string | null;
  clientes: {
    id: string; nombre: string; rfc: string | null; ciudad: string | null; zona: string | null;
    direccion: string | null; contacto_nombre: string | null; contacto_tel: string | null;
    contacto_email: string | null;
  } | null;
  chofer: { id: string; nombre: string; email: string; telefono: string | null } | null;
  pedido_productos: Array<{
    id: string; descripcion: string; cantidad: number; unidad: string | null;
    clave_sat: string | null; valor_unitario: number; importe: number; descuento: number | null;
  }>;
  entregas: Array<{
    id: string; timestamp_entrega: string | null; foto_url: string | null;
    compartido_whatsapp: boolean | null; observaciones: string | null;
    lat: number | null; lng: number | null; chofer_id: string | null;
  }>;
};

export default async function PedidoDetail({ params }: { params: { id: string } }) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  const [{ data: pedidoRaw }, { data: choferes }] = await Promise.all([
    repartoAdmin
      .from("pedidos")
      .select(
        "*, clientes:cliente_id(id, nombre, rfc, ciudad, zona, direccion, contacto_nombre, contacto_tel, contacto_email), chofer:chofer_id(id, nombre, email, telefono), pedido_productos(id, descripcion, cantidad, unidad, clave_sat, valor_unitario, importe, descuento), entregas(id, timestamp_entrega, foto_url, compartido_whatsapp, observaciones, chofer_id, lat, lng)",
      )
      .eq("id", params.id)
      .single(),
    repartoAdmin.from("usuarios").select("id, nombre").eq("es_chofer", true).eq("activo", true).order("nombre"),
  ]);

  if (!pedidoRaw) notFound();
  const pedido = pedidoRaw as unknown as Detail;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/reparto/pedidos"><ArrowLeft className="mr-1 h-4 w-4" /> Pedidos</Link>
      </Button>

      <div className="rounded-lg border bg-card p-6 brand-shadow space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display text-3xl">{pedido.numero_factura}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={ESTATUS_VARIANT[pedido.estatus]}>{ESTATUS_LABEL[pedido.estatus]}</Badge>
              {pedido.prioridad && pedido.prioridad !== "normal" && <Badge variant="warning">{pedido.prioridad}</Badge>}
              <span>{formatDate(pedido.fecha)}</span>
              {pedido.ventana_inicio && (
                <span>· ventana {pedido.ventana_inicio.slice(0, 5)}{pedido.ventana_fin ? ` – ${pedido.ventana_fin.slice(0, 5)}` : ""}</span>
              )}
              <span>· origen {pedido.origen}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="font-display text-2xl text-brand-carmesi">{formatCurrency(pedido.total)}</p>
          </div>
        </div>
        <PedidoStepper estatus={pedido.estatus} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="space-y-1 p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
          <p className="font-display text-lg">{pedido.clientes?.nombre ?? "—"}</p>
          {pedido.clientes?.rfc && <p className="text-xs text-muted-foreground">{pedido.clientes.rfc}</p>}
          {pedido.clientes?.direccion && <p className="text-sm">{pedido.clientes.direccion}</p>}
          {(pedido.clientes?.ciudad || pedido.clientes?.zona) && (
            <p className="text-sm text-muted-foreground">{[pedido.clientes?.ciudad, pedido.clientes?.zona].filter(Boolean).join(" · ")}</p>
          )}
          {pedido.clientes?.contacto_nombre && <p className="text-sm">Contacto: {pedido.clientes.contacto_nombre}</p>}
          {pedido.clientes?.contacto_tel && <p className="text-sm">Tel: <a href={`tel:${pedido.clientes.contacto_tel}`} className="text-brand-carmesi hover:underline">{pedido.clientes.contacto_tel}</a></p>}
          {pedido.direccion_entrega && <p className="mt-2 rounded-md border bg-accent/10 p-2 text-sm"><strong>Dirección de entrega:</strong> {pedido.direccion_entrega}</p>}
        </CardContent></Card>

        <Card><CardContent className="space-y-1 p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Chofer</p>
          <p className="font-display text-lg">{pedido.chofer?.nombre ?? <span className="text-amber-700">sin asignar</span>}</p>
          {pedido.chofer?.email && <p className="text-xs text-muted-foreground">{pedido.chofer.email}</p>}
          {pedido.chofer?.telefono && <p className="text-sm">Tel: <a href={`tel:${pedido.chofer.telefono}`} className="text-brand-carmesi hover:underline">{pedido.chofer.telefono}</a></p>}
          {pedido.notas && <p className="mt-2 rounded-md border bg-muted/30 p-2 text-sm">{pedido.notas}</p>}
          {pedido.motivo_problema && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
              <strong>Motivo del problema:</strong> {pedido.motivo_problema}
            </p>
          )}
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Cant.</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3 text-right">Valor unit.</th>
              <th className="px-4 py-3 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {pedido.pedido_productos.map((p) => (
              <tr key={p.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-medium">{p.descripcion}</td>
                <td className="px-4 py-3 text-right">{p.cantidad}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.unidad ?? "—"}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(p.valor_unitario)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.importe)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 text-sm">
            <tr><td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td><td className="px-4 py-2 text-right">{formatCurrency(pedido.subtotal)}</td></tr>
            <tr><td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">IVA</td><td className="px-4 py-2 text-right">{formatCurrency(pedido.iva)}</td></tr>
            <tr className="border-t"><td colSpan={4} className="px-4 py-3 text-right font-display text-lg">Total</td><td className="px-4 py-3 text-right font-display text-lg text-brand-carmesi">{formatCurrency(pedido.total)}</td></tr>
          </tfoot>
        </table>
      </CardContent></Card>

      {pedido.entregas?.length > 0 && (
        <Card><CardContent className="space-y-3 p-5">
          <h3 className="font-display text-lg">Evidencia de entrega</h3>
          {pedido.entregas.map((e) => (
            <div key={e.id} className="grid gap-3 sm:grid-cols-[160px_1fr]">
              {e.foto_url ? (
                <a href={e.foto_url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.foto_url} alt="Entrega" className="h-32 w-40 rounded-md border object-cover" />
                </a>
              ) : (
                <div className="flex h-32 w-40 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                  <Camera className="h-6 w-6" />
                </div>
              )}
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Entregado {e.timestamp_entrega ? formatDateTime(e.timestamp_entrega) : ""}</p>
                {e.compartido_whatsapp && (
                  <p className="inline-flex items-center gap-1 text-emerald-700">
                    <MessageCircle className="h-3.5 w-3.5" /> Comprobante enviado por WhatsApp
                  </p>
                )}
                {e.observaciones && <p className="rounded-md border bg-muted/30 p-2">{e.observaciones}</p>}
                {e.lat && e.lng && (
                  <p className="text-xs text-muted-foreground">
                    <a className="text-brand-carmesi hover:underline" target="_blank" rel="noreferrer"
                      href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}>Ver ubicación en Maps</a>
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent></Card>
      )}

      {(pedido.xml_url || pedido.pdf_url) && (
        <div className="flex gap-2">
          {pedido.xml_url && <Button asChild variant="outline" size="sm"><a href={pedido.xml_url} target="_blank" rel="noreferrer"><FileText className="mr-1 h-4 w-4" /> XML</a></Button>}
          {pedido.pdf_url && <Button asChild variant="outline" size="sm"><a href={pedido.pdf_url} target="_blank" rel="noreferrer"><FileText className="mr-1 h-4 w-4" /> PDF</a></Button>}
        </div>
      )}

      <PedidoActions
        pedidoId={pedido.id}
        initial={{
          estatus: pedido.estatus,
          chofer_id: pedido.chofer_id,
          prioridad: pedido.prioridad,
          ventana_inicio: pedido.ventana_inicio,
          ventana_fin: pedido.ventana_fin,
          direccion_entrega: pedido.direccion_entrega,
          notas: pedido.notas,
          motivo_problema: pedido.motivo_problema,
        }}
        choferes={(choferes ?? []) as { id: string; nombre: string }[]}
      />
    </div>
  );
}
