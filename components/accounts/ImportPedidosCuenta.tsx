"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { parseOrdersExcel, type OrderRowParsed } from "@/lib/excel/parseOrders";
import type { ParseResult } from "@/lib/excel/parseCartera";

export function ImportPedidosCuenta({
  accountId,
  repId,
}: {
  accountId: string;
  repId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseResult<OrderRowParsed> | null>(null);

  const reset = () => {
    setFileName(null);
    setPreview(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    setPreview(await parseOrdersExcel(buf));
  };

  const confirmImport = () => {
    if (!preview?.rows.length) {
      toast.error("Sin filas válidas");
      return;
    }
    startTransition(async () => {
      try {
        const { rows } = preview;
        // order_number es único global: solo insertamos folios nuevos.
        const folios = rows.map((r) => r.order_number);
        const { data: existing } = await supabase
          .from("orders")
          .select("order_number")
          .in("order_number", folios);
        const existingSet = new Set((existing ?? []).map((e) => e.order_number));

        const payload = rows
          .filter((r) => !existingSet.has(r.order_number))
          .map((r) => ({
            order_number: r.order_number,
            account_id: accountId,
            sales_rep_id: repId,
            order_type: r.order_type ?? "pedido",
            status: r.status ?? "facturada",
            order_date: r.order_date,
            subtotal: r.subtotal ?? 0,
            iva: r.iva ?? 0,
            total: r.total,
            notes: r.notes,
          }));
        const skipped = rows.length - payload.length;

        if (!payload.length) {
          toast.info(
            skipped ? "Todos los folios ya existían — nada que importar" : "Sin filas para importar",
          );
          return;
        }

        const { error } = await supabase.from("orders").insert(payload);
        if (error) throw new Error(error.message);

        toast.success(
          `${payload.length} pedido(s) importado(s)` + (skipped ? ` · ${skipped} ya existían` : ""),
        );
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error("Error al importar pedidos", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  };

  const okCount = preview?.rows.length ?? 0;
  const errCount = preview?.errors.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-1 h-4 w-4" /> Cargar pedidos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cargar pedidos</DialogTitle>
          <DialogDescription>
            Sube un Excel con un pedido por fila. Todas las filas se atribuyen a este cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            Columnas: <strong>Folio</strong>, <strong>Fecha</strong>, <strong>Total</strong>{" "}
            (requeridas). Opcionales: Tipo, Estatus, Subtotal, IVA, Notas. Por defecto quedan como{" "}
            <strong>pedido · facturada</strong>. Solo se agregan folios nuevos (los existentes se omiten).
          </p>
          <Button asChild variant="outline" size="sm">
            <a href="/templates/plantilla_pedidos_cliente.csv" download>
              <Download className="mr-1 h-4 w-4" /> Descargar plantilla
            </a>
          </Button>
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6 text-center hover:bg-muted/50">
          <FileSpreadsheet className="h-8 w-8 text-brand-carmesi" />
          <span className="font-medium">{fileName ?? "Click para subir .xlsx"}</span>
          <span className="text-xs text-muted-foreground">Solo .xlsx / .xls</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>

        {preview && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-emerald-50 p-3 text-emerald-900">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">{okCount} pedidos válidos</span>
                </div>
              </div>
              <div
                className={`rounded-md border p-3 ${
                  errCount ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{errCount} con errores</span>
                </div>
              </div>
            </div>
            {preview.errors.length > 0 && (
              <details className="rounded-md border bg-amber-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-amber-900">
                  Ver errores ({preview.errors.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Fila {e.row} — {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={pending}>
                Limpiar
              </Button>
              <Button onClick={confirmImport} disabled={pending || !okCount}>
                {pending ? "Importando…" : "Confirmar import"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
