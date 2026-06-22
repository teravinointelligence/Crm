"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  VISIT_STATUS_LABEL,
  type RepOption,
  type SupplierVisit,
  type VisitStatus,
} from "@/lib/visitas/constants";

const NONE = "__none__";

export function VisitForm({
  reps,
  repId,
  visit,
}: {
  reps: RepOption[];
  repId: string;
  /** Si se pasa, edita esa visita; si no, crea una nueva. */
  visit?: SupplierVisit;
}) {
  const router = useRouter();
  const isEdit = Boolean(visit);
  const [pending, startTransition] = useTransition();

  const [providerName, setProviderName] = useState(visit?.provider_name ?? "");
  const [wineryBrand, setWineryBrand] = useState(visit?.winery_brand ?? "");
  const [arrival, setArrival] = useState(visit?.arrival_date ?? "");
  const [departure, setDeparture] = useState(visit?.departure_date ?? "");
  const [city, setCity] = useState(visit?.city ?? "");
  const [coordinatorId, setCoordinatorId] = useState(visit?.coordinator_id ?? NONE);
  const [status, setStatus] = useState<VisitStatus>(visit?.status ?? "planning");
  const [notes, setNotes] = useState(visit?.notes ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerName.trim()) return void toast.error("Falta el nombre del proveedor.");
    if (!arrival || !departure) return void toast.error("Indica las fechas de llegada y salida.");
    if (departure < arrival) return void toast.error("La salida no puede ser antes de la llegada.");
    if (!city.trim()) return void toast.error("Falta la ciudad.");

    startTransition(async () => {
      const supabase = createClient();
      const payload = {
        provider_name: providerName.trim(),
        winery_brand: wineryBrand.trim() || null,
        arrival_date: arrival,
        departure_date: departure,
        city: city.trim(),
        coordinator_id: coordinatorId === NONE ? null : coordinatorId,
        status,
        notes: notes.trim() || null,
      };

      if (isEdit && visit) {
        const { error } = await supabase.from("supplier_visits").update(payload).eq("id", visit.id);
        if (error) return void toast.error("No se pudo guardar", { description: error.message });
        toast.success("Visita actualizada");
        router.push(`/visitas/${visit.id}`);
      } else {
        const { data, error } = await supabase
          .from("supplier_visits")
          .insert({ ...payload, created_by: repId })
          .select("id")
          .single();
        if (error) return void toast.error("No se pudo crear", { description: error.message });
        toast.success("Visita creada");
        router.push(`/visitas/${data.id}`);
      }
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="provider">Proveedor *</Label>
          <Input
            id="provider"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder="Vernazza, Bruma…"
          />
        </div>
        <div>
          <Label htmlFor="brand">Marca / Bodega</Label>
          <Input
            id="brand"
            value={wineryBrand}
            onChange={(e) => setWineryBrand(e.target.value)}
            placeholder="Gerard Bertrand…"
          />
        </div>
        <div>
          <Label htmlFor="arrival">Llegada *</Label>
          <Input id="arrival" type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="departure">Salida *</Label>
          <Input id="departure" type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="city">Ciudad *</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Los Cabos" />
        </div>
        <div>
          <Label>Coordinador</Label>
          <Select value={coordinatorId} onValueChange={setCoordinatorId}>
            <SelectTrigger>
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin asignar</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name ?? "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Estado</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as VisitStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(VISIT_STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear visita"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
