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
  // Para la bitácora: último kilometraje registrado (el del servicio más reciente
  // con km). Útil como referencia rápida del estado del auto.
  const ultimoKm = sorted.find((s) => s.km_at_service != null)?.km_at_service ?? null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg">
            <Wrench className="h-5 w-5 text-brand-carmesi" />
            Bitácora de servicios y reparaciones
          </h2>
          <p className="text-xs text-muted-foreground">
            {sorted.length} registro{sorted.length === 1 ? "" : "s"}
            {ultimoKm != null ? ` · último km registrado: ${ultimoKm.toLocaleString("es-MX")}` : ""}
          </p>
        </div>
        {mode === null ? (
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            Registrar servicio
          </Button>
        ) : null}
      </div>

      {mode !== null ? (
        <ServiceForm
          values={values}
          set={set}
          pending={pending}
          onCancel={close}
          onSubmit={submit}
          submitLabel={mode === "new" ? "Registrar servicio" : "Guardar cambios"}
        />
      ) : null}

      {sorted.length === 0 ? (
        mode === null ? (
          <p className="text-sm text-muted-foreground">Sin servicios registrados.</p>
        ) : null
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-right">Kilometraje</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Taller</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-left">Próximo</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr key={s.id} className="border-t align-top hover:bg-muted/20">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(s.date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {s.km_at_service != null ? `${s.km_at_service.toLocaleString("es-MX")} km` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{s.service_type}</span>
                        {s.description ? (
                          <span className="block text-xs text-muted-foreground">{s.description}</span>
                        ) : null}
                        {s.documento_pdf ? (
                          <a
                            href={s.documento_pdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-carmesi hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Comprobante
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{s.workshop ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {s.cost != null ? formatCurrency(s.cost) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {s.next_service_date ? formatDate(s.next_service_date) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)} disabled={pending}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(s.id)} disabled={pending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
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
