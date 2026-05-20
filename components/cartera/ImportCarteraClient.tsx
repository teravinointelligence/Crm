"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle, CheckCircle2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeClientNumber,
  parseInvoicesExcel,
  parsePaymentsExcel,
  type InvoiceParseResult,
  type InvoiceRowParsed,
  type PaymentRowParsed,
  type ParseResult,
} from "@/lib/excel/parseCartera";

type Mode = "facturas" | "pagos";

type MissingAccount = {
  client_number: string;
  name: string | null;
  count: number;
};

export function ImportCarteraClient() {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("facturas");
  const [fileName, setFileName] = useState<string | null>(null);
  const [invPreview, setInvPreview] = useState<InvoiceParseResult | null>(null);
  const [payPreview, setPayPreview] = useState<ParseResult<PaymentRowParsed> | null>(null);
  const [resolveErrors, setResolveErrors] = useState<string[]>([]);
  const [missingAccounts, setMissingAccounts] = useState<MissingAccount[]>([]);
  // Filas que fallaron por cliente faltante — se guardan para reintentar tras crear las cuentas.
  const [pendingRows, setPendingRows] = useState<InvoiceRowParsed[]>([]);

  const reset = () => {
    setFileName(null);
    setInvPreview(null);
    setPayPreview(null);
    setResolveErrors([]);
    setMissingAccounts([]);
    setPendingRows([]);
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
    setMissingAccounts([]);
    setPendingRows([]);
  };

  /** Resuelve cuentas → arma payload → filtra duplicados → inserta. Devuelve filas que fallaron por cuenta faltante. */
  const resolveAndInsert = async (
    rows: InvoiceRowParsed[],
    isAging: boolean,
  ): Promise<{ inserted: number; skipped: number; unresolved: InvoiceRowParsed[]; errs: string[] }> => {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, client_number, rfc, fiscal_name, business_name")
      .range(0, 49999);
    const byClientNum = new Map<string, string>();
    const byRfc = new Map<string, string>();
    const byFiscal = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const a of accounts ?? []) {
      const cn = normalizeClientNumber(a.client_number);
      if (cn) byClientNum.set(cn, a.id);
      if (a.rfc) byRfc.set(String(a.rfc).toUpperCase().trim(), a.id);
      if (a.fiscal_name) byFiscal.set(String(a.fiscal_name).toUpperCase().trim(), a.id);
      if (a.business_name) byName.set(String(a.business_name).toUpperCase().trim(), a.id);
    }

    const errs: string[] = [];
    const unresolved: InvoiceRowParsed[] = [];
    const payload: Record<string, unknown>[] = [];
    for (const r of rows) {
      const aid =
        (r.client_number && byClientNum.get(r.client_number)) ||
        (r.rfc && byRfc.get(r.rfc.toUpperCase().trim())) ||
        (r.client && byFiscal.get(r.client.toUpperCase().trim())) ||
        (r.client && byName.get(r.client.toUpperCase().trim()));
      if (!aid) {
        unresolved.push(r);
        errs.push(`Factura ${r.invoice_number}: cliente no encontrado (${r.client_number ? `# ${r.client_number}` : r.rfc ?? r.client ?? "?"})`);
        continue;
      }
      payload.push({
        invoice_number: r.invoice_number,
        account_id: aid,
        invoice_date: r.invoice_date,
        due_date: r.due_date,
        subtotal: r.subtotal,
        iva: r.iva,
        total: r.total,
        uuid_fiscal: r.uuid_fiscal,
        status: r.due_date && new Date(r.due_date) < new Date() ? "vencida" : "pendiente",
      });
    }

    if (!payload.length) return { inserted: 0, skipped: 0, unresolved, errs };

    let toInsert = payload;
    let skipped = 0;
    if (isAging) {
      const folios = payload.map((p) => p.invoice_number as string);
      const { data: existing } = await supabase
        .from("invoices")
        .select("invoice_number")
        .in("invoice_number", folios);
      const existingSet = new Set((existing ?? []).map((e) => e.invoice_number));
      toInsert = payload.filter((p) => !existingSet.has(p.invoice_number as string));
      skipped = payload.length - toInsert.length;
    }

    if (!toInsert.length) return { inserted: 0, skipped, unresolved, errs };

    const { error } = isAging
      ? await supabase.from("invoices").insert(toInsert)
      : await supabase.from("invoices").upsert(toInsert, { onConflict: "invoice_number" });
    if (error) throw new Error(error.message);
    return { inserted: toInsert.length, skipped, unresolved, errs };
  };

  /** Dedup de filas no resueltas por client_number (toma el primer name visto). */
  const collectMissing = (unresolved: InvoiceRowParsed[]): MissingAccount[] => {
    const map = new Map<string, MissingAccount>();
    for (const r of unresolved) {
      // Solo agrupamos por client_number — sin él no podemos crear una cuenta enlazable.
      if (!r.client_number) continue;
      const existing = map.get(r.client_number);
      if (existing) {
        existing.count++;
        if (!existing.name && r.client) existing.name = r.client;
      } else {
        map.set(r.client_number, { client_number: r.client_number, name: r.client ?? null, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  };

  const confirmInvoices = () => {
    if (!invPreview?.rows.length) { toast.error("Sin filas válidas"); return; }
    const isAging = invPreview.format === "aging";
    startTransition(async () => {
      try {
        const { inserted, skipped, unresolved, errs } = await resolveAndInsert(invPreview.rows, isAging);
        setResolveErrors(errs);
        const missing = collectMissing(unresolved);
        setMissingAccounts(missing);
        setPendingRows(unresolved);

        if (!inserted && !skipped && !unresolved.length) {
          toast.error("Sin filas para importar");
          return;
        }
        if (!inserted && skipped && !unresolved.length) {
          toast.info("Todas las facturas ya existían — nada que importar");
          return;
        }
        toast.success(
          `${inserted} facturas importadas` +
            (skipped ? ` · ${skipped} ya existían` : "") +
            (unresolved.length ? ` · ${unresolved.length} sin cuenta` : ""),
        );
        if (!unresolved.length) {
          reset();
          router.push("/cartera");
          router.refresh();
        }
      } catch (e) {
        toast.error("Error al importar facturas", { description: e instanceof Error ? e.message : String(e) });
      }
    });
  };

  const createMissingAndRetry = () => {
    if (!missingAccounts.length) return;
    const isAging = invPreview?.format === "aging";
    startTransition(async () => {
      try {
        const payload = missingAccounts.map((m) => ({
          business_name: m.name?.trim() || `Cliente ${m.client_number}`,
          client_number: m.client_number,
          status: "prospecto" as const,
        }));
        const { error } = await supabase.from("accounts").insert(payload);
        if (error) {
          toast.error("Error al crear cuentas", { description: error.message });
          return;
        }
        toast.success(`${payload.length} cuentas creadas`);

        // Reintenta con las filas que habían quedado pendientes.
        if (pendingRows.length) {
          const { inserted, skipped, unresolved, errs } = await resolveAndInsert(pendingRows, isAging);
          setResolveErrors(errs);
          const stillMissing = collectMissing(unresolved);
          setMissingAccounts(stillMissing);
          setPendingRows(unresolved);
          toast.success(
            `${inserted} facturas adicionales importadas` +
              (skipped ? ` · ${skipped} ya existían` : "") +
              (unresolved.length ? ` · ${unresolved.length} aún sin resolver` : ""),
          );
          if (!unresolved.length) {
            reset();
            router.push("/cartera");
            router.refresh();
          }
        } else {
          setMissingAccounts([]);
        }
      } catch (e) {
        toast.error("Error en el flujo", { description: e instanceof Error ? e.message : String(e) });
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

      // Dedup: si ya existe un pago con (invoice_id, fecha, monto, referencia),
      // no lo aplicamos otra vez. Sin esto, re-subir el mismo Excel duplica pagos.
      const invoiceIds = Array.from(new Set((invoices ?? []).map((i) => i.id)));
      const dedupKey = (
        invoiceId: string,
        date: string,
        amount: number,
        reference: string | null,
      ) => `${invoiceId}|${date}|${amount.toFixed(2)}|${reference ?? ""}`;
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
          errs.push(`Pago ${r.payment_date} ${r.invoice_number}: factura no encontrada`);
          continue;
        }
        const key = dedupKey(inv.id, r.payment_date, r.amount, r.reference);
        if (existingKeys.has(key)) {
          dup++;
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
        if (error) {
          errs.push(`Pago ${r.invoice_number}: ${error.message}`);
        } else {
          ok++;
          existingKeys.add(key); // evita dup dentro del mismo lote
        }
      }
      setResolveErrors(errs);
      toast.success(
        `${ok} pagos aplicados` +
          (dup ? ` · ${dup} duplicados omitidos` : "") +
          (errs.length ? ` · ${errs.length} con error` : ""),
      );
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
            <p className="text-muted-foreground">Detecta automáticamente dos formatos:</p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
              <li><strong>Antigüedad de Saldos de Clientes Detallado</strong> (reporte CONTPAQi tal cual lo exporta): agrupado por <em>Cliente: NNN</em>; cada partida tiene Vencimiento, Fecha, Serie, Folio y los buckets 1-15/16-30/31-45/46+ días. El total que se importa es el <strong>saldo abierto</strong> de cada factura.</li>
              <li><strong>Listado plano</strong>: columnas <code># Cliente</code>, <code>Folio</code>, <code>Fecha emisión</code>, <code>Fecha vencimiento</code>, <code>Subtotal</code>, <code>IVA</code>, <code>Total</code>, <code>UUID fiscal</code> (opcional).</li>
            </ul>
            <p className="text-xs text-muted-foreground">El sistema enlaza la cuenta por <strong># cliente CONTPAQi</strong>, luego por RFC, luego por razón social/nombre exacto. Si una cuenta del CRM no tiene <em># cliente</em>, asígnalo en <em>Cuentas → Sincronizar # cliente</em>. <strong>Re-importar un reporte de antigüedad solo agrega folios nuevos</strong> (no sobreescribe los existentes para no corromper los pagos ya aplicados). El listado plano sí hace upsert por Folio.</p>
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

          {missingAccounts.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <UserPlus className="h-4 w-4" />
                <span className="font-medium">
                  {missingAccounts.length} {missingAccounts.length === 1 ? "cuenta faltante" : "cuentas faltantes"} en el CRM
                </span>
              </div>
              <p className="text-xs text-amber-900">
                Se crearán como <em>prospecto</em> con <code># cliente</code> y razón social del Excel.
                Quedan sin vendedor asignado — luego un admin las completa.
              </p>
              <div className="max-h-64 overflow-y-auto rounded border border-amber-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-amber-100 text-amber-900">
                    <tr>
                      <th className="px-2 py-1 text-left"># cliente</th>
                      <th className="px-2 py-1 text-left">Razón social (Excel)</th>
                      <th className="px-2 py-1 text-right">Partidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingAccounts.map((m) => (
                      <tr key={m.client_number} className="border-t border-amber-100">
                        <td className="px-2 py-1 font-mono">{m.client_number}</td>
                        <td className="px-2 py-1">{m.name ?? <span className="text-muted-foreground">— sin nombre —</span>}</td>
                        <td className="px-2 py-1 text-right">{m.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <Button onClick={createMissingAndRetry} disabled={pending} size="sm">
                  {pending ? "Creando…" : `Crear ${missingAccounts.length} cuentas y re-importar`}
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={pending}>Cancelar</Button>
            {missingAccounts.length === 0 && (
              <Button onClick={mode === "facturas" ? confirmInvoices : confirmPayments} disabled={pending || !okCount}>
                {pending ? "Importando…" : "Confirmar import"}
              </Button>
            )}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
