"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type MatchRow = {
  num: number;
  name: string;
  rfc: string | null;
  bnet: string | null;
  firma: string;
  notes: string | null;
  account_id: string | null;
  account_name: string | null;
  sim: number;
  reason: string;
  status: "fuerte" | "dudoso" | "sin_cuenta";
};

const STATUS: Record<MatchRow["status"], { label: string; variant: "success" | "warning" | "muted" }> = {
  fuerte: { label: "Casa", variant: "success" },
  dudoso: { label: "Revisar", variant: "warning" },
  sin_cuenta: { label: "Sin cuenta", variant: "muted" },
};

export function CatalogImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setRows(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/cartera/conciliacion/catalogo", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al leer el catálogo");
      const data = json.rows as MatchRow[];
      setRows(data);
      // Preseleccionar solo los que casan fuerte y tienen cuenta.
      setPicked(new Set(data.filter((r) => r.status === "fuerte" && r.account_id).map((r) => r.num)));
    } catch (err) {
      toast.error("No pudimos leer el catálogo", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (num: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });

  const commit = async () => {
    if (!rows) return;
    const chosen = rows.filter((r) => picked.has(r.num) && r.account_id);
    if (!chosen.length) {
      toast.warning("Selecciona al menos un cliente con cuenta");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cartera/conciliacion/catalogo/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: chosen.map((r) => ({
            name: r.name,
            firma: r.firma || null,
            bnet: r.bnet,
            rfc: r.rfc,
            account_id: r.account_id,
            notes: r.notes,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al importar");
      toast.success(`Catálogo importado: ${json.clientes} clientes · ${json.llaves} llaves`);
      setRows(null);
      setPicked(new Set());
      router.refresh();
    } catch (err) {
      toast.error("No pudimos importar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const conCuenta = rows?.filter((r) => r.account_id).length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted/30">
            <Upload className="h-8 w-8 text-brand-carmesi" />
            <span className="font-medium">Subir catálogo de clientes (Excel)</span>
            <span className="text-xs text-muted-foreground">
              Casa cada cliente con su cuenta y siembra las llaves de conciliación (BNET, RFC, nombre).
            </span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} disabled={busy} />
          </label>
        </CardContent>
      </Card>

      {busy && !rows && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo y casando con tus cuentas…
        </p>
      )}

      {rows && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">{rows.length}</span> clientes en el catálogo ·{" "}
                <span className="font-medium">{conCuenta}</span> con cuenta ·{" "}
                <span className="font-medium text-emerald-700">{picked.size}</span> seleccionados
              </div>
              <Button onClick={commit} disabled={busy || picked.size === 0}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Importar {picked.size} seleccionados
              </Button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/80 text-left text-xs uppercase text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">Catálogo</th>
                    <th className="px-3 py-2">Cuenta CRM</th>
                    <th className="px-3 py-2">Llaves</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = STATUS[r.status];
                    return (
                      <tr key={r.num} className="border-b last:border-b-0">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={picked.has(r.num)}
                            disabled={!r.account_id}
                            onChange={() => toggle(r.num)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.name}</div>
                          {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                        </td>
                        <td className="px-3 py-2">
                          {r.account_name ?? <span className="text-muted-foreground">—</span>}
                          {r.account_id && r.status === "dudoso" && (
                            <div className="text-xs text-amber-700">{r.reason} ({Math.round(r.sim * 100)}%)</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {[r.bnet && `BNET ${r.bnet}`, r.rfc && `RFC ${r.rfc}`, r.firma && "nombre"]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Los "Sin cuenta" no se pueden importar todavía (no hay un cliente claro en el CRM); se
              identificarán solos cuando los concilies a mano una vez.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
