"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  POLICY_COVERAGES,
  daysUntil,
  type FlotaInsurancePolicy,
} from "@/lib/flota-types";

type FormState = Record<string, string>;

function toForm(p?: FlotaInsurancePolicy | null): FormState {
  return {
    insurer: p?.insurer ?? "",
    policy_number: p?.policy_number ?? "",
    coverage: p?.coverage ?? "",
    insured_amount: p?.insured_amount != null ? String(p.insured_amount) : "",
    annual_premium: p?.annual_premium != null ? String(p.annual_premium) : "",
    payment_method: p?.payment_method ?? "",
    start_date: p?.start_date ?? "",
    end_date: p?.end_date ?? "",
    documento_pdf: p?.documento_pdf ?? "",
    notes: p?.notes ?? "",
  };
}

function RenewalBadge({ endDate }: { endDate?: string | null }) {
  const d = daysUntil(endDate);
  if (d == null) return null;
  if (d < 0) return <Badge variant="warning">Vencida hace {Math.abs(d)} d</Badge>;
  if (d <= 30) return <Badge variant="warning">Renueva en {d} d</Badge>;
  return <Badge variant="success">Vigente</Badge>;
}

export function InsuranceSection({
  vehicleId,
  policies,
}: {
  vehicleId: string;
  policies: FlotaInsurancePolicy[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // null = sin formulario abierto; "new" = alta; id = edición de esa póliza.
  const [mode, setMode] = useState<null | "new" | string>(null);
  const [values, setValues] = useState<FormState>(toForm());

  function openNew() {
    setValues(toForm());
    setMode("new");
  }
  function openEdit(p: FlotaInsurancePolicy) {
    setValues(toForm(p));
    setMode(p.id);
  }
  function close() {
    setMode(null);
  }
  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    if (!values.insurer.trim()) return toast.error("La aseguradora es obligatoria.");
    if (!values.policy_number.trim()) return toast.error("El número de póliza es obligatorio.");
    const isEdit = mode !== "new";
    startTransition(async () => {
      try {
        const res = await fetch(
          isEdit ? `/api/flota/polizas/${mode}` : "/api/flota/polizas",
          {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...values, vehicle_id: vehicleId }),
          },
        );
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error ?? "No se pudo guardar la póliza.");
        toast.success(isEdit ? "Póliza actualizada." : "Póliza agregada.");
        close();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("¿Eliminar esta póliza?")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/flota/polizas/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "No se pudo eliminar.");
        }
        toast.success("Póliza eliminada.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar.");
      }
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <ShieldCheck className="h-5 w-5 text-brand-carmesi" />
          Seguro
        </h2>
        {mode === null ? (
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar póliza
          </Button>
        ) : null}
      </div>

      {policies.length === 0 && mode === null ? (
        <p className="text-sm text-muted-foreground">Sin póliza registrada.</p>
      ) : null}

      {policies.map((p) =>
        mode === p.id ? (
          <PolicyForm
            key={p.id}
            values={values}
            set={set}
            pending={pending}
            onCancel={close}
            onSubmit={submit}
            submitLabel="Guardar cambios"
          />
        ) : (
          <Card key={p.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {p.insurer} · póliza {p.policy_number}
                </div>
                <div className="flex items-center gap-2">
                  <RenewalBadge endDate={p.end_date} />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)} disabled={pending}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(p.id)} disabled={pending}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                <Field label="Cobertura" value={p.coverage} />
                <Field label="Vigencia" value={p.start_date ? formatDate(p.start_date) : null} />
                <Field label="Renovación" value={p.end_date ? formatDate(p.end_date) : null} />
                <Field
                  label="Suma asegurada"
                  value={p.insured_amount != null ? formatCurrency(p.insured_amount) : null}
                />
                <Field
                  label="Prima anual"
                  value={p.annual_premium != null ? formatCurrency(p.annual_premium) : null}
                />
                <Field label="Forma de pago" value={p.payment_method} />
              </dl>
              {p.notes ? <p className="text-xs text-muted-foreground">{p.notes}</p> : null}
              {p.documento_pdf ? (
                <a
                  href={p.documento_pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-carmesi hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver carátula
                </a>
              ) : null}
            </CardContent>
          </Card>
        ),
      )}

      {mode === "new" ? (
        <PolicyForm
          values={values}
          set={set}
          pending={pending}
          onCancel={close}
          onSubmit={submit}
          submitLabel="Agregar póliza"
        />
      ) : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

function PolicyForm({
  values,
  set,
  pending,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  values: FormState;
  set: (k: string, v: string) => void;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="insurer">
              Aseguradora<span className="text-brand-carmesi"> *</span>
            </Label>
            <Input id="insurer" value={values.insurer} onChange={(e) => set("insurer", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policy_number">
              No. de póliza<span className="text-brand-carmesi"> *</span>
            </Label>
            <Input
              id="policy_number"
              value={values.policy_number}
              onChange={(e) => set("policy_number", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cobertura</Label>
            <Select
              value={values.coverage || undefined}
              onValueChange={(v) => set("coverage", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona..." />
              </SelectTrigger>
              <SelectContent>
                {POLICY_COVERAGES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment_method">Forma de pago</Label>
            <Input
              id="payment_method"
              value={values.payment_method}
              onChange={(e) => set("payment_method", e.target.value)}
              placeholder="Anual, mensual, etc."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start_date">Inicio de vigencia</Label>
            <Input
              id="start_date"
              type="date"
              value={values.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end_date">Renovación / fin de vigencia</Label>
            <Input
              id="end_date"
              type="date"
              value={values.end_date}
              onChange={(e) => set("end_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insured_amount">Suma asegurada</Label>
            <Input
              id="insured_amount"
              type="number"
              inputMode="numeric"
              value={values.insured_amount}
              onChange={(e) => set("insured_amount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="annual_premium">Prima anual</Label>
            <Input
              id="annual_premium"
              type="number"
              inputMode="numeric"
              value={values.annual_premium}
              onChange={(e) => set("annual_premium", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="documento_pdf">Carátula (URL PDF)</Label>
            <Input
              id="documento_pdf"
              value={values.documento_pdf}
              onChange={(e) => set("documento_pdf", e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="poliza_notes">Notas</Label>
          <Textarea
            id="poliza_notes"
            rows={2}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
