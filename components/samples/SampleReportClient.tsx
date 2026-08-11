"use client";

// Reporte de muestras por vendedor: el rango de fechas viaja en la URL (lo
// resuelve el server, ver app/(app)/muestras/reporte/page.tsx) y los filtros de
// vendedor / estatus se aplican en el cliente sobre las filas ya traídas.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { downloadCsv } from "@/lib/csv";
import { formatCurrency, formatDate } from "@/lib/utils";

export type SampleReportRow = {
  id: string;
  folio: string;
  fecha: string | null;
  repId: string;
  vendedor: string;
  cliente: string | null;
  clientNumber: string | null;
  motivo: string | null;
  estatus: string;
  botellas: number;
  valor: number;
  sinPrecio: number;
  capacitacionPersonas: number | null;
  productos: string;
};

const ALL = "_all";
// Los borradores todavía no se solicitan (no llegan a admin): fuera por defecto.
const SIN_BORRADOR = "_sin_borrador";

const ESTATUS = ["enviada", "aprobada", "entregada", "rechazada", "cancelada", "borrador"];

const statusVariant: Record<string, "muted" | "warning" | "success" | "danger" | "accent"> = {
  borrador: "muted",
  enviada: "warning",
  aprobada: "accent",
  entregada: "success",
  rechazada: "danger",
  cancelada: "muted",
};

// ── Aritmética de fechas "YYYY-MM-DD" (sin zona: se opera en UTC a mediodía) ──
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function monthStart(key: string, offset = 0): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 10);
}
function monthEnd(key: string, offset = 0): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m + offset, 0));
  return d.toISOString().slice(0, 10);
}

export function SampleReportClient({
  rows,
  desde,
  hasta,
  hoy,
}: {
  rows: SampleReportRow[];
  desde: string;
  hasta: string;
  /** Hoy en hora de Los Cabos (lo calcula el server para no depender del equipo). */
  hoy: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vendedor, setVendedor] = useState(ALL);
  const [estatus, setEstatus] = useState(SIN_BORRADOR);

  const setRango = (d: string, h: string) => {
    startTransition(() => {
      router.replace(`/muestras/reporte?desde=${d}&hasta=${h}`);
    });
  };

  const presets = [
    { label: "Este mes", desde: monthStart(hoy), hasta: hoy },
    { label: "Mes pasado", desde: monthStart(hoy, -1), hasta: monthEnd(hoy, -1) },
    { label: "Últimos 90 días", desde: addDays(hoy, -89), hasta: hoy },
  ];

  const vendedores = useMemo(
    () =>
      Array.from(new Map(rows.map((r) => [r.repId, r.vendedor])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (vendedor !== ALL && r.repId !== vendedor) return false;
        if (estatus === SIN_BORRADOR) return r.estatus !== "borrador";
        if (estatus !== ALL && r.estatus !== estatus) return false;
        return true;
      }),
    [rows, vendedor, estatus],
  );

  // ── Corte por vendedor ─────────────────────────────────────────────────────
  type RepAgg = {
    repId: string;
    vendedor: string;
    solicitudes: number;
    botellas: number;
    valor: number;
    sinPrecio: number;
    capacitaciones: number;
    clientes: Set<string>;
  };
  const porVendedor = useMemo(() => {
    const map = new Map<string, RepAgg>();
    for (const r of filtered) {
      const agg =
        map.get(r.repId) ??
        {
          repId: r.repId,
          vendedor: r.vendedor,
          solicitudes: 0,
          botellas: 0,
          valor: 0,
          sinPrecio: 0,
          capacitaciones: 0,
          clientes: new Set<string>(),
        };
      agg.solicitudes += 1;
      agg.botellas += r.botellas;
      agg.valor += r.valor;
      agg.sinPrecio += r.sinPrecio;
      if (r.capacitacionPersonas != null) agg.capacitaciones += 1;
      if (r.cliente) agg.clientes.add(r.cliente);
      map.set(r.repId, agg);
    }
    return [...map.values()].sort((a, b) => b.botellas - a.botellas);
  }, [filtered]);

  const totales = porVendedor.reduce(
    (acc, r) => ({
      solicitudes: acc.solicitudes + r.solicitudes,
      botellas: acc.botellas + r.botellas,
      valor: acc.valor + r.valor,
      sinPrecio: acc.sinPrecio + r.sinPrecio,
    }),
    { solicitudes: 0, botellas: 0, valor: 0, sinPrecio: 0 },
  );

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);

  const sufijo = `${desde}_a_${hasta}`;
  const exportResumen = () =>
    downloadCsv(`muestras-por-vendedor_${sufijo}`, [
      ["Vendedor", "Solicitudes", "Botellas", "Clientes", "Capacitaciones", "Valor (precio lista)", "Botellas sin precio"],
      ...porVendedor.map((r) => [
        r.vendedor,
        r.solicitudes,
        r.botellas,
        r.clientes.size,
        r.capacitaciones,
        r.valor.toFixed(2),
        r.sinPrecio,
      ]),
      ["TOTAL", totales.solicitudes, totales.botellas, "", "", totales.valor.toFixed(2), totales.sinPrecio],
    ]);

  const exportDetalle = () =>
    downloadCsv(`muestras-detalle_${sufijo}`, [
      ["Folio", "Fecha", "Vendedor", "Cliente", "No. cliente", "Motivo", "Estatus", "Botellas", "Valor (precio lista)", "Personas capacitación", "Productos"],
      ...filtered.map((r) => [
        r.folio,
        r.fecha ? r.fecha.slice(0, 10) : "",
        r.vendedor,
        r.cliente ?? "",
        r.clientNumber ?? "",
        r.motivo ?? "",
        r.estatus,
        r.botellas,
        r.valor.toFixed(2),
        r.capacitacionPersonas ?? "",
        r.productos,
      ]),
    ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input
                id="desde"
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => e.target.value && setRango(e.target.value, hasta)}
                className="w-[10rem]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input
                id="hasta"
                type="date"
                value={hasta}
                min={desde}
                onChange={(e) => e.target.value && setRango(desde, e.target.value)}
                className="w-[10rem]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant={desde === p.desde && hasta === p.hasta ? "default" : "outline"}
                  onClick={() => setRango(p.desde, p.hasta)}
                  disabled={pending}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger className="sm:w-52"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los vendedores</SelectItem>
                {vendedores.map(([id, nombre]) => (
                  <SelectItem key={id} value={id}>{nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={estatus} onValueChange={setEstatus}>
              <SelectTrigger className="sm:w-52"><SelectValue placeholder="Estatus" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_BORRADOR}>Solicitadas (sin borradores)</SelectItem>
                <SelectItem value={ALL}>Todos los estatus</SelectItem>
                {ESTATUS.map((s) => (
                  <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={exportResumen} disabled={filtered.length === 0}>
                <Download className="mr-1 h-4 w-4" /> CSV por vendedor
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={exportDetalle} disabled={filtered.length === 0}>
                <Download className="mr-1 h-4 w-4" /> CSV detalle
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {pending
              ? "Actualizando…"
              : `${totales.solicitudes} solicitudes · ${totales.botellas} botellas · ${formatCurrency(totales.valor)} a precio de lista${
                  totales.sinPrecio > 0 ? ` (+${totales.sinPrecio} botellas sin precio de catálogo)` : ""
                }`}
          </p>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin muestras en el rango"
          description="No hay solicitudes con estos filtros entre las fechas seleccionadas."
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3">
                <h3 className="font-display text-lg">Por vendedor</h3>
                <p className="text-xs text-muted-foreground">
                  Del {formatDate(desde)} al {formatDate(hasta)}. El valor es a precio de lista del catálogo.
                </p>
              </div>
              <TableScroll className="rounded-none border-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Vendedor</th>
                      <th className="px-4 py-2 text-right">Solicitudes</th>
                      <th className="px-4 py-2 text-right">Botellas</th>
                      <th className="px-4 py-2 text-right">Clientes</th>
                      <th className="px-4 py-2 text-right">Capacitaciones</th>
                      <th className="px-4 py-2 text-right">Valor (precio lista)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porVendedor.map((r) => (
                      <tr key={r.repId} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2 font-medium">{r.vendedor}</td>
                        <td className="px-4 py-2 text-right">{r.solicitudes}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{r.botellas}</td>
                        <td className="px-4 py-2 text-right">{r.clientes.size}</td>
                        <td className="px-4 py-2 text-right">{r.capacitaciones}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatCurrency(r.valor)}
                          {r.sinPrecio > 0 && (
                            <div className="text-xs text-muted-foreground">+{r.sinPrecio} bot. sin precio</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-medium">
                      <td className="px-4 py-2">TOTAL</td>
                      <td className="px-4 py-2 text-right">{totales.solicitudes}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{totales.botellas}</td>
                      <td className="px-4 py-2 text-right">—</td>
                      <td className="px-4 py-2 text-right">—</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(totales.valor)}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableScroll>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3">
                <h3 className="font-display text-lg">Detalle de solicitudes</h3>
                <p className="text-xs text-muted-foreground">Cada solicitud del periodo con sus botellas.</p>
              </div>
              <TableScroll className="rounded-none border-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Folio</th>
                      <th className="px-4 py-2 text-left">Fecha</th>
                      <th className="px-4 py-2 text-left">Vendedor</th>
                      <th className="px-4 py-2 text-left">Cliente</th>
                      <th className="px-4 py-2 text-left">Motivo</th>
                      <th className="px-4 py-2 text-right">Botellas</th>
                      <th className="px-4 py-2 text-right">Valor</th>
                      <th className="px-4 py-2 text-left">Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2 font-medium">
                          <Link href={`/muestras/${r.id}`} className="hover:text-brand-carmesi">{r.folio}</Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatDate(r.fecha)}</td>
                        <td className="px-4 py-2">{r.vendedor}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {r.cliente ?? "—"}
                          {r.capacitacionPersonas != null && (
                            <Badge variant="muted" className="ml-1.5 align-middle text-[10px]">
                              capacitación {r.capacitacionPersonas}p
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{r.motivo ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{r.botellas}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.valor)}</td>
                        <td className="px-4 py-2">
                          <Badge variant={statusVariant[r.estatus] ?? "muted"}>{r.estatus}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              <div className="px-4 py-3">
                <Pager page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
