"use client";

// Captura de una toma de inventario para una consignación: conteo físico por
// producto + firmas con el dedo (encargado del cliente y vendedor). Responsivo
// en iPad y celular. Envía a POST /api/consignaciones/tomas.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { SignaturePad } from "@/components/ui/SignaturePad";

export type TomaItemSeed = {
  producto_id?: string;
  producto_nombre: string;
  codigo?: string;
  presentacion?: string;
  cantidad_anterior: number;
};

type Row = TomaItemSeed & { cantidad_contada: string; observacion_item: string };

export function TomaInventarioForm({
  consignacionId,
  clienteNombre,
  vendedorNombre,
  seedItems,
}: {
  consignacionId: string;
  clienteNombre: string;
  vendedorNombre: string;
  seedItems: TomaItemSeed[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    seedItems.map((s) => ({ ...s, cantidad_contada: String(s.cantidad_anterior ?? 0), observacion_item: "" })),
  );
  const [encargadoNombre, setEncargadoNombre] = useState("");
  const [encargadoCargo, setEncargadoCargo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [firmaEncargado, setFirmaEncargado] = useState<string | null>(null);
  const [firmaVendedor, setFirmaVendedor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const upd = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const diff = (r: Row) => (Number(r.cantidad_contada) || 0) - (Number(r.cantidad_anterior) || 0);

  async function guardar(firmar: boolean) {
    if (saving) return;
    if (firmar) {
      if (!encargadoNombre.trim()) {
        toast.error("Escribe el nombre del encargado del cliente");
        return;
      }
      if (!firmaEncargado || !firmaVendedor) {
        toast.error("Faltan firmas", { description: "Se requieren la firma del encargado y la del vendedor." });
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/consignaciones/tomas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consignacion_id: consignacionId,
          encargado_nombre: encargadoNombre.trim() || undefined,
          encargado_cargo: encargadoCargo.trim() || undefined,
          observaciones_generales: observaciones.trim() || undefined,
          firma_encargado: firmar ? firmaEncargado : undefined,
          firma_vendedor: firmar ? firmaVendedor : undefined,
          items: rows.map((r) => ({
            producto_id: r.producto_id,
            producto_nombre: r.producto_nombre,
            codigo: r.codigo,
            presentacion: r.presentacion,
            cantidad_anterior: Number(r.cantidad_anterior) || 0,
            cantidad_contada: Number(r.cantidad_contada) || 0,
            observacion_item: r.observacion_item.trim() || undefined,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo guardar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success(data.estado === "firmado" ? "Toma firmada y guardada" : "Borrador guardado");
      router.push(`/consignaciones/tomas/${data.id}`);
      router.refresh();
    } catch (e) {
      toast.error("Error de red", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-1 p-6">
          <h3 className="font-display text-lg">Conteo de inventario</h3>
          <p className="text-sm text-muted-foreground">
            {clienteNombre} · Vendedor: {vendedorNombre}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Producto</th>
                  <th className="px-3 py-3 text-right">Anterior</th>
                  <th className="px-3 py-3 text-right">Contado</th>
                  <th className="px-3 py-3 text-right">Dif.</th>
                  <th className="px-3 py-3">Observación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const d = diff(r);
                  return (
                    <tr key={r.producto_id ?? i} className="border-b align-top last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.producto_nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.codigo, r.presentacion].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={r.cantidad_anterior}
                          onChange={(e) => upd(i, { cantidad_anterior: Number(e.target.value) || 0 })}
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={r.cantidad_contada}
                          onChange={(e) => upd(i, { cantidad_contada: e.target.value })}
                          className="w-20 text-right"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          d < 0 ? "text-red-600" : d > 0 ? "text-green-700" : "text-muted-foreground"
                        }`}
                      >
                        {d > 0 ? `+${d}` : d}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={r.observacion_item}
                          onChange={(e) => upd(i, { observacion_item: e.target.value })}
                          placeholder="merma, faltante…"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="enc-nombre">Encargado del cliente</Label>
            <Input id="enc-nombre" value={encargadoNombre} onChange={(e) => setEncargadoNombre(e.target.value)} placeholder="Nombre de quien recibe" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enc-cargo">Cargo / puesto</Label>
            <Input id="enc-cargo" value={encargadoCargo} onChange={(e) => setEncargadoCargo(e.target.value)} placeholder="Sommelier, gerente…" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="obs">Observaciones generales</Label>
            <Textarea id="obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas de la visita, acuerdos…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-display text-lg">Firmas</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <SignaturePad label={`Encargado del cliente${encargadoNombre ? ` · ${encargadoNombre}` : ""}`} onChange={setFirmaEncargado} />
            <SignaturePad label={`Vendedor · ${vendedorNombre}`} onChange={setFirmaVendedor} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="ghost" onClick={() => guardar(false)} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Guardar borrador
        </Button>
        <Button onClick={() => guardar(true)} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PenLine className="mr-1 h-4 w-4" />}
          Firmar y guardar
        </Button>
      </div>
    </div>
  );
}
