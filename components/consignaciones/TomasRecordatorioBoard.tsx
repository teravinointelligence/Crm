"use client";

// Tablero admin: agrupa las consignaciones pendientes de toma por vendedor y
// permite enviarle a cada uno (o a todos) un recordatorio por correo.
// Espejo de ClientesInactivosBoard, pero los datos vienen de Base44.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, Loader2, ChevronDown, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type TomaItem = {
  consignacionId: string;
  cliente: string;
  estado: string;
  ultimaToma: string | null;
  diasSinToma: number | null;
};

export type VendedorTomasGroup = {
  vendedorId: string;
  vendedorNombre: string;
  email: string | null;
  activo: boolean;
  items: TomaItem[];
};

const DAY_OPTIONS = [7, 14, 30];
const DEFAULT_DAYS = 14;

const ESTADO_LABEL: Record<string, string> = { pendiente: "Pendiente", parcial: "Parcial" };

function ultimaTomaLabel(it: TomaItem): string {
  if (it.diasSinToma === null) return "Sin toma registrada";
  const fecha = it.ultimaToma
    ? new Date(it.ultimaToma).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  const dias = it.diasSinToma === 1 ? "1 día" : `${it.diasSinToma} días`;
  return fecha ? `Hace ${dias} · ${fecha}` : `Hace ${dias}`;
}

export function TomasRecordatorioBoard({ groups }: { groups: VendedorTomasGroup[] }) {
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  const filtered = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((a) => a.diasSinToma === null || a.diasSinToma >= days),
      }))
      .filter((g) => g.items.length > 0)
      .sort((x, y) => y.items.length - x.items.length);
  }, [groups, days]);

  const enviables = filtered.filter((g) => g.email && g.activo && g.items.length);
  const totalClientes = filtered.reduce((s, g) => s + g.items.length, 0);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const enviar = async (vendedorId: string): Promise<boolean> => {
    setSending(vendedorId);
    try {
      const res = await fetch(`/api/consignaciones/recordatorio-tomas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendedorId, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al enviar");
      toast.success(`Recordatorio enviado a ${json.repName}`, { description: `${json.count} clientes · ${json.to}` });
      return true;
    } catch (err) {
      toast.error("No se pudo enviar", { description: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      setSending(null);
    }
  };

  const enviarTodos = async () => {
    if (!confirm(`¿Enviar el recordatorio de tomas (${days} días) a ${enviables.length} vendedores?`)) return;
    setBulk(true);
    let ok = 0;
    for (const g of enviables) {
      if (await enviar(g.vendedorId)) ok++;
    }
    setBulk(false);
    toast.success(`Listo: ${ok}/${enviables.length} recordatorios enviados`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Sin toma desde hace al menos
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((d) => {
            const on = days === d;
            return (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  on ? "border-brand-carmesi bg-brand-carmesi text-white" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {d} días
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="text-sm">
          <span className="font-medium">{totalClientes}</span> clientes por inventariar ·{" "}
          <span className="font-medium">{enviables.length}</span> vendedores con recordatorios
        </div>
        <Button onClick={enviarTodos} disabled={bulk || enviables.length === 0}>
          {bulk ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
          Enviar a todos ({enviables.length})
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ningún cliente con consignación lleva {days} días o más sin toma.
        </p>
      ) : (
        filtered.map((g) => {
          const key = g.vendedorId;
          const isOpen = open.has(key);
          const canSend = !!(g.email && g.activo);
          return (
            <Card key={key}>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <button onClick={() => toggle(key)} className="flex items-center gap-2 text-left">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">{g.vendedorNombre}</span>
                    <Badge variant="warning">{g.items.length}</Badge>
                    {g.email && <span className="text-xs text-muted-foreground">{g.email}</span>}
                  </button>
                  {canSend ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => enviar(g.vendedorId)}
                      disabled={sending === g.vendedorId || bulk}
                    >
                      {sending === g.vendedorId ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mail className="mr-1 h-3.5 w-3.5" />
                      )}
                      Enviar recordatorio
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Vendedor sin email en TERAVINO Flow</span>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t">
                    <table className="min-w-full text-sm">
                      <tbody>
                        {g.items.map((a) => (
                          <tr key={a.consignacionId} className="border-b last:border-b-0">
                            <td className="px-4 py-2 font-medium">{a.cliente}</td>
                            <td className="px-4 py-2 text-muted-foreground">{ESTADO_LABEL[a.estado] ?? a.estado}</td>
                            <td className="px-4 py-2 text-muted-foreground">{ultimaTomaLabel(a)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
