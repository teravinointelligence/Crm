// Formulario para crear un pedido manual (sin XML). Maneja cliente (con búsqueda
// y creación rápida), partidas, prioridad, ventana horaria y datos de entrega.

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { PEDIDO_TIPOS, PRIORIDADES, TIPO_LABEL, type PedidoTipo, type Prioridad } from "@/types/reparto";

// Radix Select v2 no permite <SelectItem value="">; usamos un centinela para
// la opción "Sin asignar" y lo mapeamos a "" (→ null al crear el pedido).
const SIN_ASIGNAR = "sin_asignar";

type ClienteLite = { id: string; nombre: string; rfc: string | null; ciudad: string | null };
type ChoferLite = { id: string; nombre: string; es_chofer?: boolean };
type Partida = {
  key: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valor_unitario: number;
};

export function PedidoForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [cliente, setCliente] = useState<ClienteLite | null>(null);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteOpen, setClienteOpen] = useState(false);
  const [creatingCliente, setCreatingCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", rfc: "", ciudad: "", direccion: "" });

  const [choferes, setChoferes] = useState<ChoferLite[]>([]);
  const [choferId, setChoferId] = useState<string>("");

  const [tipo, setTipo] = useState<PedidoTipo>("factura");
  const [pdf, setPdf] = useState<File | null>(null);
  const [numFactura, setNumFactura] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [ventanaInicio, setVentanaInicio] = useState("");
  const [ventanaFin, setVentanaFin] = useState("");
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas] = useState("");

  const [partidas, setPartidas] = useState<Partida[]>([
    { key: crypto.randomUUID(), descripcion: "", cantidad: 1, unidad: "PZA", valor_unitario: 0 },
  ]);

  useEffect(() => {
    fetch("/api/reparto/choferes")
      .then((r) => r.json())
      .then((j) => setChoferes(j.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!clienteOpen) return;
    const t = setTimeout(() => {
      fetch(`/api/reparto/clientes?q=${encodeURIComponent(clienteQuery)}`)
        .then((r) => r.json())
        .then((j) => setClientes(j.data ?? []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [clienteQuery, clienteOpen]);

  const subtotal = useMemo(
    () => partidas.reduce((s, p) => s + (Number(p.cantidad) || 0) * (Number(p.valor_unitario) || 0), 0),
    [partidas],
  );
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;

  const addPartida = () =>
    setPartidas((p) => [...p, { key: crypto.randomUUID(), descripcion: "", cantidad: 1, unidad: "PZA", valor_unitario: 0 }]);
  const updPartida = (key: string, patch: Partial<Partida>) =>
    setPartidas((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const rmPartida = (key: string) => setPartidas((p) => p.filter((x) => x.key !== key));

  const folioLabel =
    tipo === "factura" ? "Folio / # factura" : tipo === "traspaso" ? "Folio del traspaso" : "Folio / referencia";

  const submit = () => {
    if (!cliente) { toast.error("Selecciona un cliente"); return; }
    if (!numFactura.trim()) { toast.error(`${folioLabel} requerido`); return; }
    if (!fecha) { toast.error("Fecha requerida"); return; }
    if (partidas.some((p) => !p.descripcion.trim() || p.cantidad <= 0)) {
      toast.error("Revisa descripción y cantidad de las partidas");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/reparto/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_factura: numFactura.trim(),
          tipo,
          fecha,
          cliente_id: cliente.id,
          chofer_id: choferId || null,
          prioridad,
          ventana_inicio: ventanaInicio || null,
          ventana_fin: ventanaFin || null,
          direccion_entrega: direccion.trim() || null,
          notas: notas.trim() || null,
          origen: "manual",
          productos: partidas.map((p) => ({
            descripcion: p.descripcion.trim(),
            cantidad: Number(p.cantidad),
            unidad: p.unidad || null,
            valor_unitario: Number(p.valor_unitario),
            importe: Math.round(Number(p.cantidad) * Number(p.valor_unitario) * 100) / 100,
          })),
          subtotal,
          iva,
          total,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Error al crear pedido"); return; }
      // PDF del documento (traspaso, consignación, patrocinio…): se adjunta
      // después de crear; si falla, el pedido ya existe y se puede resubir
      // desde su detalle.
      if (pdf) {
        const fd = new FormData();
        fd.append("pdf", pdf);
        const up = await fetch(`/api/reparto/pedidos/${json.data.id}/pdf`, { method: "POST", body: fd });
        if (!up.ok) {
          const upJson = await up.json().catch(() => ({}));
          toast.warning("Pedido creado, pero el PDF no se subió", {
            description: upJson.error ?? `HTTP ${up.status} — vuelve a intentarlo desde el detalle del pedido`,
          });
          router.push(`/reparto/pedidos/${json.data.id}`);
          router.refresh();
          return;
        }
      }
      toast.success(pdf ? "Pedido creado con su PDF" : "Pedido creado");
      router.push(`/reparto/pedidos/${json.data.id}`);
      router.refresh();
    });
  };

  const crearCliente = () => {
    if (!nuevoCliente.nombre.trim()) { toast.error("Nombre del cliente requerido"); return; }
    startTransition(async () => {
      const res = await fetch("/api/reparto/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevoCliente),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Error al crear cliente"); return; }
      setCliente({
        id: json.data.id,
        nombre: json.data.nombre,
        rfc: json.data.rfc,
        ciudad: nuevoCliente.ciudad || null,
      });
      setCreatingCliente(false);
      setClienteOpen(false);
      toast.success("Cliente creado");
    });
  };

  return (
    <div className="space-y-6">
      <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Cliente *</Label>
          <Dialog open={clienteOpen} onOpenChange={setClienteOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-start">
                {cliente ? (
                  <span>
                    {cliente.nombre}
                    {cliente.rfc && <span className="ml-2 text-xs text-muted-foreground">{cliente.rfc}</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Buscar cliente…</span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Cliente del pedido</DialogTitle></DialogHeader>
              {creatingCliente ? (
                <div className="grid gap-3">
                  <div className="space-y-1.5"><Label>Nombre *</Label>
                    <Input value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} /></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label>RFC</Label>
                      <Input value={nuevoCliente.rfc} onChange={(e) => setNuevoCliente({ ...nuevoCliente, rfc: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Ciudad</Label>
                      <Input value={nuevoCliente.ciudad} onChange={(e) => setNuevoCliente({ ...nuevoCliente, ciudad: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Dirección</Label>
                    <Input value={nuevoCliente.direccion} onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })} /></div>
                  <div className="flex justify-between gap-2">
                    <Button variant="ghost" onClick={() => setCreatingCliente(false)} disabled={pending}>Cancelar</Button>
                    <Button onClick={crearCliente} disabled={pending}>Crear cliente</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input autoFocus placeholder="Nombre o RFC…" value={clienteQuery} onChange={(e) => setClienteQuery(e.target.value)} className="pl-9" />
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {clientes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin resultados.</p>
                    ) : (
                      clientes.map((c) => (
                        <button key={c.id} type="button"
                          onClick={() => { setCliente(c); setClienteOpen(false); }}
                          className="flex w-full flex-col items-start rounded-md border bg-card p-2 text-left text-sm hover:border-brand-carmesi">
                          <span className="font-medium">{c.nombre}</span>
                          <span className="text-xs text-muted-foreground">
                            {[c.rfc, c.ciudad].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setCreatingCliente(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Cliente nuevo
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2 sm:col-span-2"><Label>Tipo de pedido *</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as PedidoTipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PEDIDO_TIPOS.map((t) => (
                <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tipo === "traspaso" && (
            <p className="text-xs text-muted-foreground">
              Resurtido de consignación: se entrega como traspaso de almacén al almacén de consignación del cliente (sin factura).
            </p>
          )}
          {tipo === "consignacion" && (
            <p className="text-xs text-muted-foreground">
              Entrega de una consignación nueva (sin factura); registra el folio o referencia del documento de consignación.
            </p>
          )}
        </div>

        <div className="space-y-2"><Label>{folioLabel} *</Label>
          <Input value={numFactura} onChange={(e) => setNumFactura(e.target.value)} placeholder={tipo === "factura" ? "FA14315" : tipo === "traspaso" ? "TR-0042" : "CONS-0042"} /></div>
        <div className="space-y-2"><Label>Fecha *</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="space-y-2"><Label>Prioridad</Label>
          <Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-2"><Label>Asignar a</Label>
          <Select
            value={choferId || SIN_ASIGNAR}
            onValueChange={(v) => setChoferId(v === SIN_ASIGNAR ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
              {choferes.some((c) => c.es_chofer) && (
                <SelectGroup>
                  <SelectLabel>Choferes</SelectLabel>
                  {choferes.filter((c) => c.es_chofer).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {choferes.some((c) => !c.es_chofer) && (
                <SelectGroup>
                  <SelectLabel>Otros usuarios (entrega personal)</SelectLabel>
                  {choferes.filter((c) => !c.es_chofer).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select></div>

        <div className="space-y-2"><Label>Ventana inicio</Label>
          <Input type="time" value={ventanaInicio} onChange={(e) => setVentanaInicio(e.target.value)} /></div>
        <div className="space-y-2"><Label>Ventana fin</Label>
          <Input type="time" value={ventanaFin} onChange={(e) => setVentanaFin(e.target.value)} /></div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Documento PDF {tipo === "factura" ? "(opcional)" : "del documento (opcional)"}</Label>
          <Input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            {tipo === "factura"
              ? "PDF de la factura, si lo tienes a la mano (máx 10 MB)."
              : "Sube el PDF del traspaso / consignación / patrocinio para que el chofer lo lleve consigo (máx 10 MB)."}
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2"><Label>Dirección de entrega</Label>
          <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, colonia, ciudad…" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Notas especiales</Label>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Acceso, contacto, urgencias…" /></div>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Partidas</h3>
          <Button type="button" size="sm" variant="outline" onClick={addPartida}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Agregar partida
          </Button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2 pr-2">Descripción</th><th className="py-2 pr-2 w-20">Cant.</th><th className="py-2 pr-2 w-20">Unidad</th><th className="py-2 pr-2 w-28">Valor unit.</th><th className="py-2 pr-2 text-right w-28">Importe</th><th className="w-8" /></tr>
          </thead>
          <tbody>
            {partidas.map((p) => (
              <tr key={p.key} className="border-b align-top">
                <td className="py-2 pr-2"><Input value={p.descripcion} onChange={(e) => updPartida(p.key, { descripcion: e.target.value })} /></td>
                <td className="py-2 pr-2"><Input type="number" min={0} step="0.01" value={p.cantidad} onChange={(e) => updPartida(p.key, { cantidad: Number(e.target.value) || 0 })} /></td>
                <td className="py-2 pr-2"><Input value={p.unidad} onChange={(e) => updPartida(p.key, { unidad: e.target.value })} /></td>
                <td className="py-2 pr-2"><Input type="number" min={0} step="0.01" value={p.valor_unitario} onChange={(e) => updPartida(p.key, { valor_unitario: Number(e.target.value) || 0 })} /></td>
                <td className="py-2 pr-2 text-right font-medium">{formatCurrency(p.cantidad * p.valor_unitario)}</td>
                <td className="py-2"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => rmPartida(p.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>IVA 16%</span><span>{formatCurrency(iva)}</span></div>
          <div className="flex justify-between font-display text-xl"><span>Total</span><span className="text-brand-carmesi">{formatCurrency(total)}</span></div>
        </div>
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
        <Button onClick={submit} disabled={pending}>{pending ? "Creando…" : "Crear pedido"}</Button>
      </div>
    </div>
  );
}
