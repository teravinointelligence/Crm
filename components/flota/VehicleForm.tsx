"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { FlotaVehicle } from "@/lib/base44-flota";

type FieldDef = {
  key: keyof FlotaVehicle;
  label: string;
  type?: "text" | "number";
  required?: boolean;
  placeholder?: string;
};

const FIELDS: FieldDef[] = [
  { key: "brand", label: "Marca", required: true },
  { key: "model", label: "Modelo", required: true },
  { key: "year", label: "Año", type: "number", required: true },
  { key: "version", label: "Versión" },
  { key: "plates", label: "Placas" },
  { key: "vin", label: "No. de serie (VIN)" },
  { key: "holder", label: "Titular / contratante" },
  { key: "location", label: "Plaza / ubicación" },
  { key: "assigned_driver", label: "Conductor asignado" },
  { key: "current_km", label: "Kilometraje actual", type: "number" },
  { key: "estimated_value", label: "Valor estimado", type: "number" },
];

export function VehicleForm({ vehicle }: { vehicle?: FlotaVehicle | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!vehicle;

  const initial: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = vehicle?.[f.key];
    initial[f.key as string] = v == null ? "" : String(v);
  }
  initial.notes = vehicle?.notes ?? "";

  const [values, setValues] = useState<Record<string, string>>(initial);

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    if (!values.brand?.trim()) return toast.error("La marca es obligatoria.");
    if (!values.model?.trim()) return toast.error("El modelo es obligatorio.");
    if (!values.year?.trim()) return toast.error("El año es obligatorio.");

    startTransition(async () => {
      try {
        const res = await fetch(isEdit ? `/api/flota/${vehicle!.id}` : "/api/flota", {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          throw new Error(
            data.error ?? (isEdit ? "No se pudieron guardar los cambios." : "No se pudo crear el vehículo."),
          );
        }
        toast.success(isEdit ? "Vehículo actualizado." : "Vehículo agregado.");
        router.push("/flota");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key as string} className="space-y-1.5">
              <Label htmlFor={f.key as string}>
                {f.label}
                {f.required ? <span className="text-brand-carmesi"> *</span> : null}
              </Label>
              <Input
                id={f.key as string}
                type={f.type === "number" ? "number" : "text"}
                inputMode={f.type === "number" ? "numeric" : undefined}
                value={values[f.key as string] ?? ""}
                onChange={(e) => set(f.key as string, e.target.value)}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            rows={3}
            value={values.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Reparaciones pendientes, observaciones, etc."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/flota")} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Save className="mr-1 h-4 w-4" />
            {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Agregar vehículo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
