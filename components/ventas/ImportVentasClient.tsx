"use client";

// Import de ventas mensuales por vendedor. Sabrina (admin) sube el Excel de
// CONTPAQ ("Detalle por Cliente"); cada fila se matchea por # cliente CONTPAQ a
// una cuenta del CRM, y el vendedor se deriva del assigned_rep_id de la cuenta
// (distribución automática). Upsert por (account_id, period).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { normalizeClientNumber } from "@/lib/excel/parseCartera";
import { parseVentasExcel, type VentaRowParsed } from "@/lib/excel/parseVentas";
import { formatCurrency } from "@/lib/utils";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function defaultPeriodMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ImportVentasClient() {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(defaultPeriodMonth()); // YYYY-MM
  const [rows, setRows] = useState<VentaRowParsed[] | null>(null);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [resolveErrors, setResolveErrors] = useState<string[]>([]);
  const [discrepancias, setDiscrepancias] = useState<string[]>([]);

  const reset = () => {
    setFileName(null);
    setRows(null);
    setParseErrors([]);
    setResolveErrors([]);
    setDiscrepancias([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResolveErrors([]);
    setDiscrepancias([]);
    const buf = await file.arrayBuffer();
    const result = await parseVentasExcel(buf);
    setRows(result.rows);
    setParseErrors(result.errors);
    if (result.periodGuess) setPeriod(result.periodGuess.slice(0, 7));
  };

  const confirm = () => {
    if (!rows?.length) { toast.error("Sin filas válidas"); return; }
    const periodDate = `${period}-01`;
    startTransition(async () => {
      // Cuentas con su vendedor asignado, indexadas por client_number normalizado.
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, client_number, business_name, assigned_rep_id")
        .range(0, 49999);
      const byClientNum = new Map<string, { id: string; assigned_rep_id: string | null; name: string }>();
      for (const a of accounts ?? []) {
        const cn = normalizeClientNumber(a.client_number);
        if (cn) byClientNum.set(cn, { id: a.id, assigned_rep_id: a.assigned_rep_id, name: a.business_name });
      }

      // Nombres de reps para detectar discrepancias contra el vendedor del Excel.
      const { data: reps } = await supabase.from("sales_reps").select("id, full_name");
      const repName = new Map((reps ?? []).map((r) => [r.id, (r.full_name ?? "").toUpperCase()]));

      const errs: string[] = [];
      const discs: string[] = [];
      const payload: Record<string, unknown>[] = [];
      for (const r of rows) {
        const acc = r.client_number ? byClientNum.get(r.client_number) : undefined;
        if (!acc) {
          errs.push(`# ${r.client_number ?? "?"} (${r.client_name ?? "?"}): cliente no existe en el CRM`);
          continue;
        }
        if (!acc.assigned_rep_id) {
          errs.push(`# ${r.client_number} (${acc.name}): la cuenta no tiene vendedor asignado`);
          continue;
        }
        // Cross-check contra el vendedor del Excel.
        if (r.vendedor_excel) {
          const crmRep = repName.get(acc.assigned_rep_id) ?? "";
          if (crmRep && !crmRep.includes(r.vendedor_excel.toUpperCase()) && !r.vendedor_excel.toUpperCase().includes(crmRep.split(" ")[0])) {
            discs.push(`# ${r.client_number} (${acc.name}): Excel dice "${r.vendedor_excel}", CRM tiene "${repName.get(acc.assigned_rep_id)}"`);
          }
        }
        payload.push({
          account_id: acc.id,
          sales_rep_id: acc.assigned_rep_id,
          period: periodDate,
          client_number: r.client_number,
          client_name: r.client_name,
          vendedor_excel: r.vendedor_excel,
          venta_bruta: r.venta_bruta,
          neto: r.neto,
          descuento: r.descuento,
          neto_desc: r.neto_desc,
        });
      }
      setResolveErrors(errs);
      setDiscrepancias(discs);
      if (!payload.length) { toast.error("Ninguna venta pudo asociarse a una cuenta con vendedor"); return; }

      const { error } = await supabase.from("monthly_sales").upsert(payload, { onConflict: "account_id,period" });
      if (error) { toast.error("Error al importar ventas", { description: error.message }); return; }
      toast.success(
        `${payload.length} ventas importadas para ${period}` +
          (errs.length ? ` · ${errs.length} con error` : "") +
          (discs.length ? ` · ${discs.length} discrepancias` : ""),
      );
      if (!errs.length) {
        reset();
        router.push(`/ventas?period=${period}`);
        router.refresh();
      }
    });
  };

  const totalBruta = (rows ?? []).reduce((s, r) => s + r.venta_bruta, 0);
  const [py, pm] = period.split("-").map(Number);

  return (
    <div className="space-y-6">
      <Card><CardContent className="space-y-2 p-6 text-sm">
        <h3 className="font-display text-lg">Carga de ventas mensuales</h3>
        <p className="text-muted-foreground">
          Sube el reporte de ventas por vendedor (CONTPAQ). Se lee la hoja
          <strong> Detalle por Cliente</strong> y cada fila se asigna automáticamente al
          vendedor según el <strong># cliente CONTPAQ</strong> y la cuenta del CRM.
        </p>
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li>Columnas esperadas en la hoja de detalle: <code>Vendedor</code>, <code># Cliente</code>, <code>Nombre Comercial</code>, <code>Venta Bruta</code>, <code>Neto</code>, <code>Descuento</code>, <code>Neto-Desc.</code></li>
          <li>El vendedor se toma del <em>assigned_rep_id</em> de la cuenta en el CRM (no de la columna Vendedor del Excel — esa se usa solo para detectar discrepancias).</li>
          <li>Re-importar el mismo mes actualiza los valores (upsert por cuenta + periodo).</li>
        </ul>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="period">Mes del reporte</Label>
          <Input
            id="period"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-48"
          />
          {py && pm && (
            <p className="text-xs text-muted-foreground">Importando como: {MESES[pm - 1]} {py}</p>
          )}
        </div>
        <label className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center cursor-pointer hover:bg-muted/50">
          <FileSpreadsheet className="h-10 w-10 text-brand-carmesi" />
          <span className="font-medium">{fileName ?? "Click para subir archivo .xlsx"}</span>
          <span className="text-xs text-muted-foreground">Reporte de ventas por vendedor (CONTPAQ)</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
      </CardContent></Card>

      {rows && (
        <Card><CardContent className="space-y-4 p-6">
          <h3 className="font-display text-lg">Preview</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span className="font-medium">{rows.length} clientes</span></div>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs uppercase text-muted-foreground">Venta bruta total</div>
              <div className="font-display text-xl">{formatCurrency(totalBruta)}</div>
            </div>
            <div className={`rounded-md border p-4 ${parseErrors.length ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"}`}>
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span className="font-medium">{parseErrors.length} errores de formato</span></div>
            </div>
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

          {discrepancias.length > 0 && (
            <details className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-blue-900 flex items-center gap-2">
                <Users className="h-4 w-4" /> Discrepancias de vendedor ({discrepancias.length})
              </summary>
              <p className="mt-1 text-xs text-blue-900">El vendedor del Excel difiere del asignado en el CRM. La venta se atribuyó al del CRM. Revisa si hay que reasignar la cuenta.</p>
              <ul className="mt-2 space-y-1 text-xs text-blue-900">
                {discrepancias.map((d, i) => <li key={`d${i}`}>{d}</li>)}
              </ul>
            </details>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={pending}>Cancelar</Button>
            <Button onClick={confirm} disabled={pending || !rows.length || !period}>
              {pending ? "Importando…" : `Confirmar import (${period})`}
            </Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
