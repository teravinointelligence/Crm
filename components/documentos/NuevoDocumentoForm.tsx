"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOC_CATEGORY_LABEL, type DocCategory } from "@/lib/documentos-types";

type TemplateOption = { id: string; name: string; category: DocCategory };
type AccountOption = { id: string; business_name: string; rfc: string | null; region: string | null };

export function NuevoDocumentoForm({
  templates,
  accounts,
  initialTemplateId,
  initialAccountId,
  consignacionId,
}: {
  templates: TemplateOption[];
  accounts: AccountOption[];
  initialTemplateId?: string;
  initialAccountId?: string;
  consignacionId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(
    initialTemplateId && templates.some((t) => t.id === initialTemplateId) ? initialTemplateId : "",
  );
  const [accountId, setAccountId] = useState(
    initialAccountId && accounts.some((a) => a.id === initialAccountId) ? initialAccountId : "",
  );
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts.slice(0, 50);
    return accounts
      .filter(
        (a) =>
          a.business_name.toLowerCase().includes(q) ||
          (a.rfc ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [accounts, search]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  function submit() {
    if (!templateId) return toast.error("Elige una plantilla.");
    if (!accountId) return toast.error("Elige un cliente.");
    startTransition(async () => {
      try {
        const res = await fetch("/api/documentos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id: templateId, account_id: accountId, consignacion_id: consignacionId }),
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          throw new Error(data.error ?? "No se pudo generar el documento.");
        }
        toast.success("Documento generado.");
        router.push(`/documentos/${data.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al generar.");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label>Plantilla</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un formato..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · {DOC_CATEGORY_LABEL[t.category] ?? t.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            {selectedAccount ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{selectedAccount.business_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedAccount.rfc ?? "Sin RFC"}
                    {selectedAccount.region ? ` · ${selectedAccount.region}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAccountId("")}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Busca por razón social o RFC..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">Sin coincidencias.</p>
                  ) : (
                    filtered.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAccountId(a.id);
                          setSearch("");
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40"
                      >
                        <span>
                          <span className="font-medium">{a.business_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {a.rfc ?? "Sin RFC"}
                            {a.region ? ` · ${a.region}` : ""}
                          </span>
                        </span>
                        {accountId === a.id ? <Check className="h-4 w-4 text-brand-carmesi" /> : null}
                      </button>
                    ))
                  )}
                </div>
                {accounts.length > 50 && !search ? (
                  <p className="text-xs text-muted-foreground">
                    Mostrando los primeros 50 — escribe para buscar entre {accounts.length} cuentas.
                  </p>
                ) : null}
              </>
            )}
          </div>

          {consignacionId && (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              La lista de vinos de esta consignación se insertará automáticamente en el placeholder{" "}
              <code>{"{{lista_vinos}}"}</code> de la plantilla.
            </p>
          )}

          <Button onClick={submit} disabled={pending} className="w-full">
            <FileText className="mr-1 h-4 w-4" />
            {pending ? "Generando..." : "Generar documento"}
          </Button>
        </CardContent>
      </Card>

      <Card className="hidden lg:block">
        <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
          <h3 className="font-display text-base text-foreground">Cómo funciona</h3>
          <p>
            El formato se llena automáticamente con los datos de la cuenta seleccionada (razón
            social, RFC, dirección) y de su contacto principal (nombre, correo, teléfono).
          </p>
          <p>
            Los campos que el CRM no tiene —como la fecha de inicio, el plazo de pago o el código
            postal— quedan en una línea para completarse a mano al firmar.
          </p>
          <p>
            Después de generar podrás revisar el texto, marcarlo como finalizado o enviado, y
            descargarlo en PDF con el membrete de TERAVINO.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
