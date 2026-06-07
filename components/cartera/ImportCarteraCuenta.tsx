"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  parseInvoicesExcel,
  parsePaymentsExcel,
  type InvoiceParseResult,
  type PaymentRowParsed,
  type ParseResult,
} from "@/lib/excel/parseCartera";

type Mode = "facturas" | "pagos";

const PAYMENT_METHODS = ["transferencia", "efectivo", "cheque", "tarjeta", "deposito", "otro"];

export function ImportCarteraCuenta({
  accountId,
  businessName,
}: {
  accountId: string;
  businessName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("facturas");
  const [fileName, setFileName] = useState<string | null>(null);
  const [invPreview, setInvPreview] = useState<InvoiceParseResult | null>(null);
  const [payPreview, setPayPreview] = useState<ParseResult<PaymentRowParsed> | null>(null);
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
    if (!invPreview?.rows.length) {
      toast.error("Sin filas válidas");
      return;
    }
    const isAging = invPreview.format === "aging";
    startTransition(async () => {
      try {
        // Todas las filas se atribuyen a ESTA cuenta — sin emparejar por # cliente.
        const payload = invPreview.rows.map((r) => ({
          invoice_number: r.invoice_number,
          account_id: accountId,
          invoice_date: r.invoice_date,
          due_date: r.due_date,
          subtotal: r.subtotal,
          iva: r.iva,
          total: r.total,
          uuid_fiscal: r.uuid_fiscal,
          status: r.due_date && new Date(r.due_date) < new Date() ? "vencida" : "pendiente",
        }));

        let toInsert = payload;
        let skipped = 0;
        // El reporte de antigüedad solo agrega folios nuevos (no sobreescribe pagos aplicados).
        if (isAging) {
          const folios = payload.map((p) => p.invoice_number);
          const { data: existing } = await supabase
            .from("invoices")
            .select("invoice_number")
            .in("invoice_number", folios);
          const existingSet = new Set((existing ?? []).map((e) => e.invoice_number));
          toInsert = payload.filter((p) => !existingSet.has(p.invoice_number));
          skipped = payload.length - toInsert.length;
        }

        if (!toInsert.length) {
          toast.info(
            skipped ? "Todas las facturas ya existían — nada que importar" : "Sin filas para importar",
          );
          return;
        }

        const { error } = isAging
          ? await supabase.from("invoices").insert(toInsert)
          : await supabase.from("invoices").upsert(toInsert, { onConflict: "invoice_number" });
        if (error) throw new Error(error.message);

        toast.success(
          `${toInsert.length} factura(s) importada(s)` + (skipped ? ` · ${skipped} ya existían` : ""),
        );
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error("Error al importar facturas", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  };

  const confirmPayments = () => {
    if (!payPreview?.rows.length) {
      toast.error("Sin filas válidas");
      return;
    }
    startTransition(async () => {
      try {
        const folios = Array.from(new Set(payPreview.rows.map((r) => r.invoice_number)));
        // Buscamos folios SOLO dentro de esta cuenta para no aplicar a otro cliente.
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, account_id")
          .eq("account_id", accountId)
          .in("invoice_number", folios);
        const byFolio = new Map((invoices ?? []).map((i) => [i.invoice_number, i]));

        const invoiceIds = Array.from(new Set((invoices ?? []).map((i) => i.id)));
        const dedupKey = (invoiceId: string, date: string, amount: number, reference: string | null) =>
          `${invoiceId}|${date}|${amount.toFixed(2)}|${reference ?? ""}`;
        const existingKeys = new Set<string>();
        if (invoiceIds.length) {
          const { data: existing } = await supabase
            .from("payments")
            .select("invoice_id, payment_date, amount, reference")
            .in("invoice_id", invoiceIds);
          for (const p of existing ?? []) {
            if (!p.invoice_id) continue;
            existingKeys.add(dedupKey(p.invoice_id, p.payment_date, Number(p.amount), p.reference));
          }
        }

        const errs: string[] = [];
        let ok = 0;
        let dup = 0;
        for (const r of payPreview.rows) {
          const inv = byFolio.get(r.invoice_number);
          if (!inv) {
            errs.push(`Pago ${r.payment_date} ${r.invoice_number}: factura no encontrada en este cliente`);
            continue;
          }
          const key = dedupKey(inv.id, r.payment_date, r.amount, r.reference);
          if (existingKeys.has(key)) {
            dup++;
            continue;
          }
          const { error } = await supabase.rpc("apply_payment", {
            p_account_id: accountId,
            p_amount: r.amount,
            p_payment_date: r.payment_date,
            p_method: r.method && PAYMENT_METHODS.includes(r.method) ? r.method : "otro",
            p_reference: r.reference,
            p_notes: "Import Excel (cuenta)",
            p_invoice_id: inv.id,
          });
          if (error) errs.push(`Pago ${r.invoice_number}: ${error.message}`);
          else {
            ok++;
            existingKeys.add(key);
          }
        }
        setResolveErrors(errs);
        toast.success(
          `${ok} pago(s) aplicado(s)` +
            (dup ? ` · ${dup} duplicados omitidos` : "") +
            (errs.length ? ` · ${errs.length} con error` : ""),
        );
        if (!errs.length) {
          reset();
          setOpen(false);
          router.refresh();
        }
      } catch (e) {
        toast.error("Error al aplicar pagos", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  };

  const okCount = mode === "facturas" ? invPreview?.rows.length ?? 0 : payPreview?.rows.length ?? 0;
  const parseErrors = mode === "facturas" ? invPreview?.errors ?? [] : payPreview?.errors ?? [];
  const errCount = parseErrors.length;

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
          <Upload className="mr-1 h-4 w-4" /> Cargar cartera
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cargar cartera — {businessName}</DialogTitle>
          <DialogDescription>
            Sube el Excel de este cliente. Todas las filas se atribuyen a esta cuenta, sin emparejar
            por # cliente.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            reset();
          }}
        >
          <TabsList>
            <TabsTrigger value="facturas">Facturas</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
          </TabsList>
          <TabsContent value="facturas" className="pt-2 text-xs text-muted-foreground">
            Formatos: reporte de antigüedad CONTPAQi o listado plano (Folio, Fecha, Vencimiento,
            Total…). El de antigüedad solo agrega folios nuevos; el listado plano hace upsert por folio.
          </TabsContent>
          <TabsContent value="pagos" className="pt-2 text-xs text-muted-foreground">
            Columnas: Fecha pago, Folio factura, Monto, Método, Referencia. Cada pago se aplica a la
            factura indicada (buscada dentro de este cliente).
          </TabsContent>
        </Tabs>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6 text-center hover:bg-muted/50">
          <FileSpreadsheet className="h-8 w-8 text-brand-carmesi" />
          <span className="font-medium">{fileName ?? "Click para subir .xlsx"}</span>
          <span className="text-xs text-muted-foreground">Solo .xlsx / .xls</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>

        {(invPreview || payPreview) && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-emerald-50 p-3 text-emerald-900">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">{okCount} filas válidas</span>
                </div>
              </div>
              <div
                className={`rounded-md border p-3 ${
                  errCount ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{errCount} con errores de formato</span>
                </div>
              </div>
            </div>
            {(parseErrors.length > 0 || resolveErrors.length > 0) && (
              <details className="rounded-md border bg-amber-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-amber-900">
                  Ver errores ({parseErrors.length + resolveErrors.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {parseErrors.map((e, i) => (
                    <li key={`p${i}`}>Fila {e.row} — {e.message}</li>
                  ))}
                  {resolveErrors.map((e, i) => (
                    <li key={`r${i}`}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={pending}>
                Limpiar
              </Button>
              <Button
                onClick={mode === "facturas" ? confirmInvoices : confirmPayments}
                disabled={pending || !okCount}
              >
                {pending ? "Importando…" : "Confirmar import"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
