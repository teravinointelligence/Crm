"use client";

// Import de ventas mensuales. Autodetecta dos formatos:
//   1. Reporte crudo CONTPAQ "Reporte de Ventas por Cliente" → trae detalle por
//      producto (alimenta top de vinos real). Guarda monthly_sales + items.
//   2. "Ventas por Vendedor" (hoja Detalle por Cliente) → solo totales por cliente.
// En ambos el vendedor se deriva del assigned_rep_id de la cuenta (distribución
// automática). Upsert por (account_id, period).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { normalizeClientNumber } from "@/lib/excel/parseCartera";
import {
  isContpaqVentas,
  parseVentasContpaq,
  parseVentasExcel,
  type VentaRowParsed,
  type VentaClienteParsed,
} from "@/lib/excel/parseVentas";
import { formatCurrency } from "@/lib/utils";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function defaultPeriodMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Format = "contpaq" | "por_vendedor";

export function ImportVentasClient() {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(defaultPeriodMonth()); // YYYY-MM
  const [format, setFormat] = useState<Format | null>(null);
  const [rows, setRows] = useState<VentaRowParsed[] | null>(null);          // por_vendedor
  const [clientes, setClientes] = useState<VentaClienteParsed[] | null>(null); // contpaq
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [resolveErrors, setResolveErrors] = useState<string[]>([]);

  const reset = () => {
    setFileName(null);
    setFormat(null);
    setRows(null);
    setClientes(null);
    setParseErrors([]);
    setResolveErrors([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResolveErrors([]);
    setRows(null);
    setClientes(null);
    const buf = await file.arrayBuffer();
    if (isContpaqVentas(buf)) {
      const result = await parseVentasContpaq(buf);
      setFormat("contpaq");
      setClientes(result.clientes);
      setParseErrors(result.errors);
      if (result.periodGuess) setPeriod(result.periodGuess.slice(0, 7));
    } else {
      const result = await parseVentasExcel(buf);
      setFormat("por_vendedor");
      setRows(result.rows);
      setParseErrors(result.errors);
      if (result.periodGuess) setPeriod(result.periodGuess.slice(0, 7));
    }
  };

  // Trae cuentas indexadas por client_number normalizado, con su vendedor.
  const loadAccountsIndex = async () => {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, client_number, business_name, assigned_rep_id")
      .range(0, 49999);
    const byClientNum = new Map<string, { id: string; assigned_rep_id: string | null; name: string }>();
    for (const a of accounts ?? []) {
      const cn = normalizeClientNumber(a.client_number);
      if (cn) byClientNum.set(cn, { id: a.id, assigned_rep_id: a.assigned_rep_id, name: a.business_name });
    }
    return byClientNum;
  };

  const confirmPorVendedor = (periodDate: string) => {
    startTransition(async () => {
      const byClientNum = await loadAccountsIndex();
      const errs: string[] = [];
      const payload: Record<string, unknown>[] = [];
      for (const r of rows ?? []) {
        const acc = r.client_number ? byClientNum.get(r.client_number) : undefined;
        if (!acc) { errs.push(`# ${r.client_number ?? "?"} (${r.client_name ?? "?"}): cliente no existe en el CRM`); continue; }
        if (!acc.assigned_rep_id) { errs.push(`# ${r.client_number} (${acc.name}): cuenta sin vendedor asignado`); continue; }
        payload.push({
          account_id: acc.id, sales_rep_id: acc.assigned_rep_id, period: periodDate,
          client_number: r.client_number, client_name: r.client_name, vendedor_excel: r.vendedor_excel,
          venta_bruta: r.venta_bruta, neto: r.neto, descuento: r.descuento, neto_desc: r.neto_desc,
        });
      }
      setResolveErrors(errs);
      if (!payload.length) { toast.error("Ninguna venta pudo asociarse a una cuenta con vendedor"); return; }
      const { error } = await supabase.from("monthly_sales").upsert(payload, { onConflict: "account_id,period" });
      if (error) { toast.error("Error al importar ventas", { description: error.message }); return; }
      toast.success(`${payload.length} ventas importadas para ${period}${errs.length ? ` · ${errs.length} con error` : ""}`);
      if (!errs.length) { reset(); router.push(`/ventas?period=${period}`); router.refresh(); }
    });
  };

  const confirmContpaq = (periodDate: string) => {
    startTransition(async () => {
      const byClientNum = await loadAccountsIndex();
      const errs: string[] = [];
      const matched: { acc: { id: string; assigned_rep_id: string | null }; c: VentaClienteParsed }[] = [];
      for (const c of clientes ?? []) {
        const acc = c.client_number ? byClientNum.get(c.client_number) : undefined;
        if (!acc) { errs.push(`# ${c.client_number ?? "?"} (${c.client_name ?? "?"}): cliente no existe en el CRM`); continue; }
        if (!acc.assigned_rep_id) { errs.push(`# ${c.client_number} (${c.client_name}): cuenta sin vendedor asignado`); continue; }
        matched.push({ acc, c });
      }
      setResolveErrors(errs);
      if (!matched.length) { toast.error("Ningún cliente pudo asociarse a una cuenta con vendedor"); return; }

      // 1) Upsert cabeceras monthly_sales (devuelve ids para enlazar items).
      const salesPayload = matched.map(({ acc, c }) => ({
        account_id: acc.id, sales_rep_id: acc.assigned_rep_id, period: periodDate,
        client_number: c.client_number, client_name: c.client_name, vendedor_excel: null,
        venta_bruta: c.venta_bruta, neto: c.neto, descuento: c.descuento, neto_desc: c.neto_desc,
      }));
      const { data: upserted, error: upErr } = await supabase
        .from("monthly_sales")
        .upsert(salesPayload, { onConflict: "account_id,period" })
        .select("id, account_id");
      if (upErr || !upserted) { toast.error("Error al importar ventas", { description: upErr?.message }); return; }

      const saleIdByAccount = new Map(upserted.map((r) => [r.account_id as string, r.id as string]));
      const saleIds = upserted.map((r) => r.id as string);

      // 2) Reemplaza los items de esos meses (borra + inserta) para idempotencia.
      if (saleIds.length) {
        await supabase.from("monthly_sales_items").delete().in("monthly_sale_id", saleIds);
      }
      const itemsPayload: Record<string, unknown>[] = [];
      for (const { acc, c } of matched) {
        const saleId = saleIdByAccount.get(acc.id);
        if (!saleId) continue;
        for (const it of c.items) {
          itemsPayload.push({
            monthly_sale_id: saleId, codigo: it.codigo, producto_nombre: it.producto_nombre,
            cantidad: it.cantidad, neto: it.neto, descuento: it.descuento,
            neto_desc: it.neto_desc, impuesto: it.impuesto, total: it.total,
          });
        }
      }
      if (itemsPayload.length) {
        // Insert por lotes de 500 para no exceder límites.
        for (let i = 0; i < itemsPayload.length; i += 500) {
          const chunk = itemsPayload.slice(i, i + 500);
          const { error: itErr } = await supabase.from("monthly_sales_items").insert(chunk);
          if (itErr) { toast.error("Error al guardar detalle de productos", { description: itErr.message }); return; }
        }
      }

      toast.success(`${matched.length} clientes · ${itemsPayload.length} líneas de producto importadas para ${period}${errs.length ? ` · ${errs.length} con error` : ""}`);
      if (!errs.length) { reset(); router.push(`/ventas?period=${period}`); router.refresh(); }
    });
  };

  const confirm = () => {
    const periodDate = `${period}-01`;
    if (format === "contpaq") {
      if (!clientes?.length) { toast.error("Sin clientes válidos"); return; }
      confirmContpaq(periodDate);
    } else {
      if (!rows?.length) { toast.error("Sin filas válidas"); return; }
      confirmPorVendedor(periodDate);
    }
  };

  const nClientes = format === "contpaq" ? clientes?.length ?? 0 : rows?.length ?? 0;
  const nItems = format === "contpaq" ? (clientes ?? []).reduce((s, c) => s + c.items.length, 0) : 0;
  const totalBruta = format === "contpaq"
    ? (clientes ?? []).reduce((s, c) => s + c.venta_bruta, 0)
    : (rows ?? []).reduce((s, r) => s + r.venta_bruta, 0);
  const hasPreview = format === "contpaq" ? clientes !== null : rows !== null;
  const [py, pm] = period.split("-").map(Number);

  return (
    <div className="space-y-6">
      <Card><CardContent className="space-y-2 p-6 text-sm">
        <h3 className="font-display text-lg">Carga de ventas mensuales</h3>
        <p className="text-muted-foreground">Acepta dos formatos (autodetectados):</p>
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li><strong>Reporte de Ventas por Cliente (CONTPAQ)</strong> — el reporte crudo. Trae <strong>detalle por producto</strong>, así que alimenta el top de vinos con ventas reales. Recomendado.</li>
          <li><strong>Ventas por Vendedor</strong> (hoja "Detalle por Cliente") — solo totales por cliente, sin productos.</li>
        </ul>
        <p className="text-xs text-muted-foreground">El vendedor se deriva del <em>cliente asignado</em> en el CRM (# cliente CONTPAQ → cuenta → vendedor). Re-importar el mismo mes actualiza.</p>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="period">Mes del reporte</Label>
          <Input id="period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-48" />
          {py && pm && <p className="text-xs text-muted-foreground">Importando como: {MESES[pm - 1]} {py}</p>}
        </div>
        <label className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center cursor-pointer hover:bg-muted/50">
          <FileSpreadsheet className="h-10 w-10 text-brand-carmesi" />
          <span className="font-medium">{fileName ?? "Click para subir archivo .xlsx / .xls"}</span>
          <span className="text-xs text-muted-foreground">Reporte de ventas CONTPAQ</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
      </CardContent></Card>

      {hasPreview && (
        <Card><CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Preview</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {format === "contpaq" ? "CONTPAQ (con productos)" : "Por vendedor (totales)"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span className="font-medium">{nClientes} clientes</span></div>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs uppercase text-muted-foreground">Venta bruta total</div>
              <div className="font-display text-xl">{formatCurrency(totalBruta)}</div>
            </div>
            {format === "contpaq" ? (
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Líneas de producto</div>
                <div className="font-display text-xl">{nItems}</div>
              </div>
            ) : (
              <div className={`rounded-md border p-4 ${parseErrors.length ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"}`}>
                <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span className="font-medium">{parseErrors.length} errores de formato</span></div>
              </div>
            )}
          </div>

          {(parseErrors.length > 0 || resolveErrors.length > 0) && (
            <details className="rounded-md border bg-amber-50 p-3 text-sm" open={resolveErrors.length > 0}>
              <summary className="cursor-pointer font-medium text-amber-900">Ver errores ({parseErrors.length + resolveErrors.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {parseErrors.map((e, i) => <li key={`p${i}`}>Fila {e.row} — {e.message}</li>)}
                {resolveErrors.map((e, i) => <li key={`r${i}`}>{e}</li>)}
              </ul>
            </details>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={pending}>Cancelar</Button>
            <Button onClick={confirm} disabled={pending || !nClientes || !period}>
              {pending ? "Importando…" : `Confirmar import (${period})`}
            </Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
