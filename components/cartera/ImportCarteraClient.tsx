"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import {
  parseInvoicesExcel,
  parsePaymentsExcel,
  type InvoiceRowParsed,
  type PaymentRowParsed,
} from "@/lib/excel/parseCartera";

type Mode = "facturas" | "pagos";

export function ImportCarteraClient() {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("facturas");
  const [fileName, setFileName] = useState<string | null>(null);
  const [invPreview, setInvPreview] = useState<{ rows: InvoiceRowParsed[]; errors: { row: number; message: string }[] } | null>(null);
  const [payPreview, setPayPreview] = useState<{ rows: PaymentRowParsed[]; errors: { row: number; message: string }[] } | null>(null);
  const [resolveErrors, setResolveErrors] = useState<string[]>([]);

  const reset = () => {
    setFileName(null);
    setInvPreview(null);
    setPayPreview(null);
    setResolveErrors([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    if (mode === "facturas") {
      setInvPreview(await parseInvoicesExcel(buf));
      setPayPreview(null);
    } else {
      setPayPreview(await parsePaymentsExcel(buf));
      setInvPreview(null);
    }
    setResolveErrors([]);
  };

  const confirmInvoices = () => {
    if (!invPreview?.rows.length) { toast.error("Sin filas válidas"); return; }
    startTransition(async () => {
      // Resolve accounts by client_number first (CONTPAQi), then RFC, fiscal_name, business_name
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, client_number, rfc, fiscal_name, business_name");
      const byClientNum = new Map<string, string>();
      const byRfc = new Map<string, string>();
      const byFiscal = new Map<string, string>();
      const byName = new Map<string, string>();
      for (const a of accounts ?? []) {
        if (a.client_number) byClientNum.set(String(a.client_number).trim(), a.id);
        if (a.rfc) byRfc.set(String(a.rfc).toUpperCase().trim(), a.id);
        if (a.fiscal_name) byFiscal.set(String(a.fiscal_name).toUpperCase().trim(), a.id);
        if (a.business_name) byName.set(String(a.business_name).toUpperCase().trim(), a.id);
      }
      const errs: string[] = [];
      const payload: Record<string, unknown>[] = [];
      for (const r of invPreview.rows) {
        const aid =
          (r.client_number && byClientNum.get(r.client_number.trim())) ||
          (r.rfc && byRfc.get(r.rfc.toUpperCase().trim())) ||
          (r.client && byFiscal.get(r.client.toUpperCase().trim())) ||
          (r.client && byName.get(r.client.toUpperCase().trim()));
        if (!aid) {
          errs.push(`Factura ${r.invoice_number}: cliente no encontrado (${r.client_number ? `# ${r.client_number}` : r.rfc ?? r.client ?? "?"})`);
          continue;
        }
        const subtotal = r.subtotal ?? Math.round((r.total / 1.16) * 100) / 100;
        const iva = r.iva ?? Math.round((r.total - subtotal) * 100) / 100;
        payload.push({
          invoice_number: r.invoice_number,
          account_id: aid,
          invoice_date: r.invoice_date,
          due_date: r.due_date,
          subtotal,
          iva,
          total: r.total,
          uuid_fiscal: r.uuid_fiscal,
          status: r.due_date && new Date(r.due_date) < new Date() ? "vencida" : "pendiente",
        });
      }
      setResolveErrors(errs);
      if (!payload.length) { toast.error("Ninguna factura pudo asociarse a un cliente"); return; }
      const { error } = await supabase.from("invoices").upsert(payload, { onConflict: "invoice_number" });
      if (error) { toast.error("Error al importar facturas", { description: error.message }); return; }
      toast.success(`${payload.length} facturas importadas${errs.length ? ` · ${errs.length} con error` : ""}`);
      if (!errs.length) {
        reset();
        router.push("/cartera");
        router.refresh();
      }
    });
  };

  const confirmPayments = () => {
    if (!payPreview?.rows.length) { toast.error("Sin filas válidas"); return; }
    startTransition(async () => {
      const folios = Array.from(new Set(payPreview.rows.map((r) => r.invoice_number)));
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, account_id")
        .in("invoice_number", folios);
      const byFolio = new Map((invoices ?? []).map((i) => [i.invoice_number, i]));
      const errs: string[] = [];
      let ok = 0;
      for (const r of payPreview.rows) {
        const inv = byFolio.get(r.invoice_number);
        if (!inv) {
          errs.push(`Pago ${r.payment_date} ${r.invoice_number}: factura no encontrada`);
          continue;
        }
        const { error } = await supabase.rpc("apply_payment", {
          p_account_id: inv.account_id,
          p_amount: r.amount,
          p_payment_date: r.payment_date,
          p_method: r.method && ["transferencia", "efectivo", "cheque", "tarjeta", "deposito", "otro"].includes(r.method) ? r.method : "otro",
          p_reference: r.reference,
          p_notes: "Import Excel",
          p_invoice_id: inv.id,
        });
        if (error) errs.push(`Pago ${r.invoice_number}: ${error.message}`);
        else ok++;
      }
      setResolveErrors(errs);
      toast.success(`${ok} pagos aplicados${errs.length ? ` · ${errs.length} con error` : ""}`);
      if (!errs.length) {
        reset();
        router.push("/cartera");
        router.refresh();
      }
    });
  };

  const okCount = mode === "facturas" ? invPreview?.rows.length ?? 0 : payPreview?.rows.length ?? 0;
  const errCount = mode === "facturas" ? invPreview?.errors.length ?? 0 : payPreview?.errors.length ?? 0;
  const parseErrors = mode === "facturas" ? invPreview?.errors ?? [] : payPreview?.errors ?? [];

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); reset(); }}>
        <TabsList>
          <TabsTrigger value="facturas">Facturas</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
        </TabsList>
        <TabsContent value="facturas">
          <Card><CardContent className="space-y-2 p-6 text-sm">
            <h3 className="font-display text-lg">Carga de facturas</h3>
            <p className="text-muted-foreground">Columnas esperadas: <strong># Cliente</strong>, Folio, Fecha emisión, Fecha vencimiento, Subtotal, IVA, Total, UUID fiscal (opcional). RFC y Cliente (razón social) son opcionales si viene <strong># Cliente</strong>.</p>
            <p className="text-xs text-muted-foreground">El sistema enlaza la cuenta por <strong># cliente CONTPAQi</strong>, luego por RFC, luego por razón social/nombre exacto. Si una cuenta del CRM aún no tiene <em># cliente</em>, asígnaselo en <em>Cuentas → Sincronizar # cliente</em>. Upsert por Folio.</p>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="pagos">
          <Card><CardContent className="space-y-2 p-6 text-sm">
            <h3 className="font-display text-lg">Carga de pagos</h3>
            <p className="text-muted-foreground">Columnas esperadas: Fecha pago, Folio factura, Monto, Método, Referencia. (# Cliente opcional para validación.)</p>
            <p className="text-xs text-muted-foreground">Cada pago se aplica a la factura indicada. Si el folio no existe, se marca en error.</p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Card><CardContent className="p-6">
        <label className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center cursor-pointer hover:bg-muted/50">
          <FileSpreadsheet className="h-10 w-10 text-brand-carmesi" />
          <span className="font-medium">{fileName ?? "Click para subir archivo .xlsx"}</span>
          <span className="text-xs text-muted-foreground">Solo .xlsx / .xls</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
      </CardContent></Card>

      {(invPreview || payPreview) && (
        <Card><CardContent className="space-y-4 p-6">
          <h3 className="font-display text-lg">Preview</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span className="font-medium">{okCount} filas válidas</span></div>
            </div>
            <div className={`rounded-md border p-4 ${errCount ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"}`}>
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span className="font-medium">{errCount} con errores de formato</span></div>
            </div>
          </div>
          {(parseErrors.length > 0 || resolveErrors.length > 0) && (
            <details className="rounded-md border bg-amber-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-amber-900">Ver errores ({parseErrors.length + resolveErrors.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {parseErrors.map((e, i) => <li key={`p${i}`}>Fila {e.row} — {e.message}</li>)}
                {resolveErrors.map((e, i) => <li key={`r${i}`}>{e}</li>)}
              </ul>
            </details>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={pending}>Cancelar</Button>
            <Button onClick={mode === "facturas" ? confirmInvoices : confirmPayments} disabled={pending || !okCount}>
              {pending ? "Importando…" : "Confirmar import"}
            </Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
