"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Wrench, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SERVICE_TYPES, type FlotaMechanicalService } from "@/lib/flota-types";

type FormState = Record<string, string>;

function toForm(s?: FlotaMechanicalService | null): FormState {
  return {
    date: s?.date ?? "",
    service_type: s?.service_type ?? "",
    description: s?.description ?? "",
    workshop: s?.workshop ?? "",
    cost: s?.cost != null ? String(s.cost) : "",
    km_at_service: s?.km_at_service != null ? String(s.km_at_service) : "",
    next_service_date: s?.next_service_date ?? "",
    documento_pdf: s?.documento_pdf ?? "",
    notes: s?.notes ?? "",
  };
}

export function ServicesSection({
  vehicleId,
  services,
}: {
  vehicleId: string;
  services: FlotaMechanicalService[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<null | "new" | string>(null);
  const [values, setValues] = useState<FormState>(toForm());

  function openNew() {
    setValues(toForm());
    setMode("new");
  }
  function openEdit(s: FlotaMechanicalService) {
    setValues(toForm(s));
    setMode(s.id);
  }
  function close() {
    setMode(null);
  }
  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    if (!values.date.trim()) return toast.error("La fecha es obligatoria.");
    if (!values.service_type.trim()) return toast.error("El tipo de servicio es obligatorio.");
    const isEdit = mode !== "new";
    startTransition(async () => {
      try {
        const res = await fetch(
          isEdit ? `/api/flota/servicios/${mode}` : "/api/flota/servicios",
          {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...values, vehicle_id: vehicleId }),
          },
        );
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error ?? "No se pudo guardar el servicio.");
        toast.success(isEdit ? "Servicio actualizado." : "Servicio registrado.");
        close();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("¿Eliminar este servicio?")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/flota/servicios/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "No se pudo eliminar.");
        }
        toast.success("Servicio eliminado.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar.");
      }
    });
  }

  const sorted = [...services].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Wrench className="h-5 w-5 text-brand-carmesi" />
          Servicios y reparaciones
        </h2>
        {mode === null ? (
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            Registrar servicio
          </Button>
        ) : null}
      </div>

      {mode === "new" ? (
        <ServiceForm
          values={values}
          set={set}
          pending={pending}
          onCancel={close}
          onSubmit={submit}
          submitLabel="Registrar servicio"
        />
      ) : null}

      {sorted.length === 0 && mode === null ? (
        <p className="text-sm text-muted-foreground">Sin servicios registrados.</p>
      ) : null}

      <div className="space-y-2">
        {sorted.map((s) =>
          mode === s.id ? (
            <ServiceForm
              key={s.id}
              values={values}
              set={set}
              pending={pending}
              onCancel={close}
              onSubmit={submit}
              submitLabel="Guardar cambios"
            />
          ) : (
            <Card key={s.id}>
              <CardContent className="space-y-1.5 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    {formatDate(s.date)} · {s.service_type}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.cost != null ? (
                      <span className="text-muted-foreground">{formatCurrency(s.cost)}</span>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} disabled={pending}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(s.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {s.description ? <p>{s.description}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {[
                    s.workshop ? `Taller: ${s.workshop}` : null,
                    s.km_at_service != null ? `${s.km_at_service.toLocaleString("es-MX")} km` : null,
                    s.next_service_date ? `Próximo: ${formatDate(s.next_service_date)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null}
                </p>
                {s.documento_pdf ? (
                  <a
                    href={s.documento_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-carmesi hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver comprobante
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </section>
  );
}

function ServiceForm({
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
            <Label htmlFor="service_date">
              Fecha<span className="text-brand-carmesi"> *</span>
            </Label>
            <Input
              id="service_date"
              type="date"
              value={values.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Tipo de servicio<span className="text-brand-carmesi"> *</span>
            </Label>
            <Select
              value={values.service_type || undefined}
              onValueChange={(v) => set("service_type", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona..." />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workshop">Taller / proveedor</Label>
            <Input id="workshop" value={values.workshop} onChange={(e) => set("workshop", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cost">Costo</Label>
            <Input
              id="cost"
              type="number"
              inputMode="numeric"
              value={values.cost}
              onChange={(e) => set("cost", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="km_at_service">Kilometraje</Label>
            <Input
              id="km_at_service"
              type="number"
              inputMode="numeric"
              value={values.km_at_service}
              onChange={(e) => set("km_at_service", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next_service_date">Próximo servicio</Label>
            <Input
              id="next_service_date"
              type="date"
              value={values.next_service_date}
              onChange={(e) => set("next_service_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="service_doc">Comprobante (URL PDF)</Label>
            <Input
              id="service_doc"
              value={values.documento_pdf}
              onChange={(e) => set("documento_pdf", e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="service_description">Descripción</Label>
          <Textarea
            id="service_description"
            rows={2}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Detalle del servicio o reparación realizada."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="service_notes">Notas</Label>
          <Textarea
            id="service_notes"
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
