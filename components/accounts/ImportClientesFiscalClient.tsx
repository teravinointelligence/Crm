"use client";

// Carga de datos fiscales de clientes desde el export CONTPAQi "Todos los Clientes".
// Casa cada fila contra accounts por # cliente (normalizado, sin ceros a la izq.)
// y llena rfc / razón social / uso CFDI / régimen fiscal. Por defecto solo rellena
// campos vacíos (no pisa datos existentes); hay opción para sobrescribir.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportResultPanel, type ImportOutcome } from "@/components/ui/import-result";
import { createClient } from "@/lib/supabase/client";
import { normalizeClientNumber } from "@/lib/excel/parseCartera";
import {
  parseClientesFiscal,
  type ClienteFiscalRow,
} from "@/lib/excel/parseClientesFiscal";

type AccountLite = {
  id: string;
  business_name: string;
  client_number: string | null;
  rfc: string | null;
  fiscal_name: string | null;
  uso_cfdi: string | null;
  regimen_fiscal: string | null;
};

const FIELDS = [
  { key: "fiscal_name", label: "Razón social" },
  { key: "rfc", label: "RFC" },
  { key: "uso_cfdi", label: "Uso CFDI" },
  { key: "regimen_fiscal", label: "Régimen" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const has = (v: string | null | undefined) => !!v && v.trim() !== "";

type Change = { key: FieldKey; from: string | null; to: string };
type PlanRow = {
  row: ClienteFiscalRow;
  account: AccountLite;
  changes: Change[];
};

export function ImportClientesFiscalClient({ accounts }: { accounts: AccountLite[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ClienteFiscalRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  // Índice de cuentas por # cliente normalizado. Un # puede tener varias cuentas.
  const byClientNum = useMemo(() => {
    const m = new Map<string, AccountLite[]>();
    for (const a of accounts) {
      const cn = normalizeClientNumber(a.client_number);
      if (!cn) continue;
      const arr = m.get(cn);
      if (arr) arr.push(a);
      else m.set(cn, [a]);
    }
    return m;
  }, [accounts]);

  const reset = () => {
    setFileName(null);
    setRows(null);
    setParseErrors([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setOutcome(null);
    const buf = await file.arrayBuffer();
    const result = parseClientesFiscal(buf);
    setRows(result.rows);
    setParseErrors(result.errors);
    if (!result.rows.length) toast.error("No se encontraron filas de clientes en el archivo");
  };

  // Clasificación de cada fila contra el CRM.
  const plan = useMemo(() => {
    const updatable: PlanRow[] = [];
    const unchanged: PlanRow[] = [];
    const ambiguous: { row: ClienteFiscalRow; accounts: AccountLite[] }[] = [];
    const missing: ClienteFiscalRow[] = [];
    if (!rows) return { updatable, unchanged, ambiguous, missing };

    for (const row of rows) {
      if (!row.client_number) {
        missing.push(row);
        continue;
      }
      const matches = byClientNum.get(row.client_number) ?? [];
      if (matches.length === 0) {
        missing.push(row);
        continue;
      }
      if (matches.length > 1) {
        ambiguous.push({ row, accounts: matches });
        continue;
      }
      const account = matches[0];
      const changes: Change[] = [];
      for (const { key } of FIELDS) {
        const incoming = row[key];
        if (!has(incoming)) continue; // el Excel no trae dato
        const current = account[key];
        const wouldChange = overwrite ? incoming!.trim() !== (current ?? "").trim() : !has(current);
        if (wouldChange) changes.push({ key, from: current, to: incoming!.trim() });
      }
      if (changes.length) updatable.push({ row, account, changes });
      else unchanged.push({ row, account, changes: [] });
    }
    return { updatable, unchanged, ambiguous, missing };
  }, [rows, byClientNum, overwrite]);

  const apply = () => {
    if (!plan.updatable.length) return;
    startTransition(async () => {
      let ok = 0;
      const errs: string[] = [];
      for (const { account, changes } of plan.updatable) {
        const payload: Record<string, string> = {};
        for (const c of changes) payload[c.key] = c.to;
        const { error } = await supabase.from("accounts").update(payload).eq("id", account.id);
        if (error) errs.push(`${account.business_name}: ${error.message}`);
        else ok++;
      }
      if (ok) toast.success(`${ok} cuenta${ok === 1 ? "" : "s"} actualizada${ok === 1 ? "" : "s"}`);
      if (errs.length) toast.error(`${errs.length} con error`, { description: errs.slice(0, 3).join(" · ") });
      // Resultado persistente (el toast desaparece): cuentas actualizadas + errores.
      setOutcome({
        ok,
        okLabel: `cuenta${ok === 1 ? "" : "s"} actualizada${ok === 1 ? "" : "s"}`,
        errors: errs,
        cta: { href: "/cuentas", label: "Ver cuentas" },
      });
      if (!errs.length) reset();
      router.refresh();
    });
  };

  const hasPreview = rows !== null;

  return (
    <div className="space-y-6">
      {outcome && <ImportResultPanel outcome={outcome} />}

      <Card>
        <CardContent className="space-y-2 p-6 text-sm">
          <h3 className="font-display text-lg">Cómo funciona</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Sube el export <strong>«Todos los Clientes»</strong> de CONTPAQi (columnas: Código
              Cliente, Razón Social, R.F.C., Uso CFDI, Régimen fiscal).
            </li>
            <li>
              Cada fila se casa con una cuenta por <strong># cliente</strong> y llena su RFC, razón
              social, uso CFDI y régimen fiscal.
            </li>
            <li>
              Por defecto <strong>solo se rellenan campos vacíos</strong>. Verás la vista previa de los
              cambios antes de aplicar.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center hover:bg-muted/50">
            <FileSpreadsheet className="h-10 w-10 text-brand-carmesi" />
            <span className="font-medium">{fileName ?? "Click para subir archivo .xlsx / .xls"}</span>
            <span className="text-xs text-muted-foreground">Catálogo de clientes CONTPAQi</span>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>
        </CardContent>
      </Card>

      {hasPreview && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg">Vista previa</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Sobrescribir datos existentes
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border bg-emerald-50 p-4 text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">{plan.updatable.length} a actualizar</span>
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-4 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MinusCircle className="h-4 w-4" />
                  <span className="font-medium">{plan.unchanged.length} sin cambios</span>
                </div>
              </div>
              <div className={`rounded-md border p-4 ${plan.ambiguous.length ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"}`}>
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  <span className="font-medium">{plan.ambiguous.length} ambiguas</span>
                </div>
              </div>
              <div className={`rounded-md border p-4 ${plan.missing.length ? "bg-amber-50 text-amber-900" : "bg-muted/30 text-muted-foreground"}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{plan.missing.length} sin cuenta</span>
                </div>
              </div>
            </div>

            {plan.updatable.length > 0 && (
              <div className="max-h-96 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Cuenta</th>
                      <th className="px-3 py-2">Cambios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.updatable.map(({ row, account, changes }) => (
                      <tr key={account.id} className="border-t align-top">
                        <td className="px-3 py-2 font-mono text-brand-carmesi">{row.codigo_raw}</td>
                        <td className="px-3 py-2 font-medium">{account.business_name}</td>
                        <td className="px-3 py-2">
                          <ul className="space-y-0.5">
                            {changes.map((c) => {
                              const label = FIELDS.find((f) => f.key === c.key)!.label;
                              return (
                                <li key={c.key} className="text-xs">
                                  <span className="text-muted-foreground">{label}: </span>
                                  {has(c.from) && (
                                    <span className="text-muted-foreground line-through">{c.from}</span>
                                  )}{" "}
                                  <span className="font-medium text-emerald-700">{c.to}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(plan.ambiguous.length > 0 || plan.missing.length > 0 || parseErrors.length > 0) && (
              <details className="rounded-md border bg-amber-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-amber-900">
                  Ver no aplicadas ({plan.ambiguous.length + plan.missing.length + parseErrors.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {plan.ambiguous.map(({ row, accounts }) => (
                    <li key={`a${row.codigo_raw}`}>
                      #{row.codigo_raw} ({row.fiscal_name ?? "?"}): varias cuentas con ese # —{" "}
                      {accounts.map((a) => a.business_name).join(", ")}. Resuélvelo en la cuenta.
                    </li>
                  ))}
                  {plan.missing.map((row) => (
                    <li key={`m${row.codigo_raw}`}>
                      #{row.codigo_raw} ({row.fiscal_name ?? "?"}): sin cuenta con ese # en el CRM.
                    </li>
                  ))}
                  {parseErrors.map((e, i) => (
                    <li key={`e${i}`}>Fila {e.row} — {e.message}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={apply} disabled={pending || !plan.updatable.length}>
                {pending ? "Aplicando…" : `Aplicar ${plan.updatable.length} actualización${plan.updatable.length === 1 ? "" : "es"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
