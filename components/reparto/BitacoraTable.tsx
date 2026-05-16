// Tabla de entregas (bitácora) con filtros y export a Excel.

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Camera, MessageCircle, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type Chofer = { id: string; nombre: string };
type Row = {
  id: string;
  timestamp_entrega: string | null;
  foto_url: string | null;
  compartido_whatsapp: boolean | null;
  observaciones: string | null;
  pedidos: {
    id: string;
    numero_factura: string;
    fecha: string;
    total: number | null;
    direccion_entrega: string | null;
    estatus: string;
    cliente: { id: string; nombre: string; rfc: string | null; ciudad: string | null; zona: string | null } | null;
  } | null;
  chofer: { id: string; nombre: string } | null;
};

export function BitacoraTable({ choferes }: { choferes: Chofer[] }) {
  const [pending, startTransition] = useTransition();
  const [chofer, setChofer] = useState<string>("todos");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const buildParams = useMemo(() => {
    const u = new URLSearchParams();
    if (chofer !== "todos") u.set("chofer_id", chofer);
    if (from) u.set("fecha_from", from);
    if (to) u.set("fecha_to", to);
    if (q.trim()) u.set("q", q.trim());
    return u;
  }, [chofer, from, to, q]);

  useEffect(() => {
    setLoading(true);
    const id = setTimeout(() => {
      fetch(`/api/reparto/bitacora?${buildParams.toString()}`)
        .then((r) => r.json())
        .then((j) => setRows(j.data ?? []))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [buildParams]);

  const exportXlsx = () => {
    startTransition(async () => {
      const params = new URLSearchParams(buildParams);
      params.set("format", "xlsx");
      window.location.href = `/api/reparto/bitacora?${params.toString()}`;
    });
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-1.5">
          <Label htmlFor="q">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, cliente, RFC, chofer…" className="pl-9" />
          </div>
        </div>
        <div className="space-y-1.5"><Label>Chofer</Label>
          <Select value={chofer} onValueChange={setChofer}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {choferes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="space-y-1.5"><Label>Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </CardContent></Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{loading ? "Cargando…" : `${rows.length} entrega(s)`}</p>
        <Button size="sm" variant="outline" onClick={exportXlsx} disabled={pending || !rows.length}>
          <Download className="mr-1 h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Fecha / hora</th>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Chofer</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-center">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin entregas en el rango seleccionado.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(r.timestamp_entrega)}</td>
                <td className="px-4 py-3 font-medium">
                  {r.pedidos ? (
                    <a href={`/reparto/pedidos/${r.pedidos.id}`} className="hover:text-brand-carmesi">{r.pedidos.numero_factura}</a>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.pedidos?.cliente?.nombre ?? "—"}
                  {r.pedidos?.cliente?.rfc && <div className="text-xs text-muted-foreground">{r.pedidos.cliente.rfc}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.pedidos?.cliente?.zona ?? r.pedidos?.cliente?.ciudad ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.chofer?.nombre ?? "—"}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(r.pedidos?.total)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    {r.foto_url ? (
                      <a href={r.foto_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-carmesi hover:underline">
                        <Camera className="h-3.5 w-3.5" /> Foto
                      </a>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                    {r.compartido_whatsapp && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <MessageCircle className="h-3.5 w-3.5" /> WA
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
