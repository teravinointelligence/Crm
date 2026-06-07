"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { BankTxnParsed } from "@/lib/bank/types";

type ParseResponse = {
  source: "table" | "pdf";
  fileKind: "pdf" | "csv" | "xlsx";
  fileName: string;
  rows: BankTxnParsed[];
  errors: { row: number; message: string }[];
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? "");
      resolve(res.includes(",") ? res.slice(res.indexOf(",") + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function UploadStatement() {
  const router = useRouter();
  const [parsing, setParsing] = useState(false);
  const [saving, startSaving] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResponse | null>(null);
  const [meta, setMeta] = useState({
    bank: "",
    account_label: "",
    account_number: "",
    period_start: "",
    period_end: "",
  });

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMeta({ bank: "", account_label: "", account_number: "", period_start: "", period_end: "" });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/cartera/conciliacion/parse", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al parsear");
      setPreview(json as ParseResponse);
      if (!json.rows?.length) toast.warning("No se detectaron movimientos en el archivo");
    } catch (err) {
      toast.error("No pudimos leer el archivo", {
        description: err instanceof Error ? err.message : String(err),
      });
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const save = () => {
    if (!preview?.rows.length || !file) return;
    startSaving(async () => {
      try {
        const file_base64 = await fileToBase64(file);
        const res = await fetch("/api/cartera/conciliacion/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bank: meta.bank || null,
            account_label: meta.account_label || null,
            account_number: meta.account_number || null,
            period_start: meta.period_start || null,
            period_end: meta.period_end || null,
            file_name: preview.fileName,
            file_kind: preview.fileKind,
            file_base64,
            transactions: preview.rows,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error al guardar");
        toast.success(`Estado de cuenta guardado (${json.inserted} movimientos)`);
        router.push(`/cartera/conciliacion/${json.statement_id}`);
        router.refresh();
      } catch (err) {
        toast.error("No pudimos guardar", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  const abonos = preview?.rows.filter((r) => r.kind === "abono") ?? [];
  const cargos = preview?.rows.filter((r) => r.kind === "cargo") ?? [];

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center hover:bg-muted/50">
          {parsing ? (
            <Loader2 className="h-10 w-10 animate-spin text-brand-carmesi" />
          ) : (
            <FileUp className="h-10 w-10 text-brand-carmesi" />
          )}
          <span className="font-medium">
            {parsing ? "Leyendo archivo…" : file ? file.name : "Subir estado de cuenta (PDF, CSV o XLSX)"}
          </span>
          <span className="text-xs text-muted-foreground">
            El PDF se lee con IA; CSV/XLSX se parsean al instante.
          </span>
          <input
            type="file"
            accept=".pdf,.csv,.xlsx,.xls"
            onChange={handleFile}
            disabled={parsing || saving}
            className="hidden"
          />
        </label>

        {preview && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-emerald-50 p-3 text-emerald-900">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {preview.rows.length} movimientos · {abonos.length} abonos · {cargos.length} cargos
                </div>
              </div>
              {preview.errors.length > 0 && (
                <details className="rounded-md border bg-amber-50 p-3 text-amber-900">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4" /> {preview.errors.length} avisos
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {preview.errors.map((e, i) => (
                      <li key={i}>Fila {e.row} — {e.message}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Banco">
                <Input value={meta.bank} onChange={(e) => setMeta({ ...meta, bank: e.target.value })} placeholder="BBVA, Santander…" />
              </Field>
              <Field label="Cuenta (alias)">
                <Input value={meta.account_label} onChange={(e) => setMeta({ ...meta, account_label: e.target.value })} placeholder="Operativa MXN" />
              </Field>
              <Field label="No. cuenta">
                <Input value={meta.account_number} onChange={(e) => setMeta({ ...meta, account_number: e.target.value })} placeholder="****1234" />
              </Field>
              <Field label="Periodo desde">
                <Input type="date" value={meta.period_start} onChange={(e) => setMeta({ ...meta, period_start: e.target.value })} />
              </Field>
              <Field label="Periodo hasta">
                <Input type="date" value={meta.period_end} onChange={(e) => setMeta({ ...meta, period_end: e.target.value })} />
              </Field>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/80 text-left text-xs uppercase text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Concepto</th>
                    <th className="px-3 py-2">Referencia</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.txn_date ? formatDate(r.txn_date) : "—"}</td>
                      <td className="px-3 py-2">{r.description}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.reference ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.kind === "abono" ? "success" : "muted"}>{r.kind}</Badge>
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${r.kind === "abono" ? "text-emerald-700" : ""}`}>
                        {formatCurrency(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={saving}>Cancelar</Button>
              <Button onClick={save} disabled={saving || !preview.rows.length}>
                {saving ? "Guardando…" : "Guardar y conciliar"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
