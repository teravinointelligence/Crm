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
import { isoToLocalInput, localInputToISO } from "@/lib/utils";
import {
  EVENT_STATUS_LABEL,
  EVENT_TYPE_OPTIONS,
  type EventStatus,
  type EventType,
  type RepOption,
} from "@/lib/visitas/constants";

const NONE = "__none__";

type EventRow = {
  id: string;
  name: string;
  event_type: EventType;
  description: string | null;
  start_date: string;
  end_date: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
  venue_contact: string | null;
  city: string;
  winery_brand: string | null;
  coordinator_id: string | null;
  visit_id: string | null;
  max_capacity: number | null;
  confirmation_deadline: string | null;
  status: EventStatus;
  budget_estimated: number | null;
  dress_code_staff: string | null;
  notes: string | null;
};

type VisitOption = { id: string; provider_name: string; arrival_date: string };

export function EventForm({
  reps,
  visits,
  repId,
  event,
  defaultVisitId,
}: {
  reps: RepOption[];
  visits: VisitOption[];
  repId: string;
  event?: EventRow;
  defaultVisitId?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(event);
  const [pending, startTransition] = useTransition();

  const [f, setF] = useState({
    name: event?.name ?? "",
    event_type: (event?.event_type ?? "cena_maridaje") as EventType,
    status: (event?.status ?? "upcoming") as EventStatus,
    start_date: event ? isoToLocalInput(event.start_date) : "",
    end_date: event ? isoToLocalInput(event.end_date) : "",
    city: event?.city ?? "",
    winery_brand: event?.winery_brand ?? "",
    venue_name: event?.venue_name ?? "",
    venue_address: event?.venue_address ?? "",
    venue_map_url: event?.venue_map_url ?? "",
    venue_contact: event?.venue_contact ?? "",
    coordinator_id: event?.coordinator_id ?? NONE,
    visit_id: event?.visit_id ?? defaultVisitId ?? NONE,
    max_capacity: event?.max_capacity?.toString() ?? "",
    confirmation_deadline: event?.confirmation_deadline
      ? isoToLocalInput(event.confirmation_deadline)
      : "",
    budget_estimated: event?.budget_estimated?.toString() ?? "",
    dress_code_staff: event?.dress_code_staff ?? "",
    description: event?.description ?? "",
    notes: event?.notes ?? "",
  });
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("Falta el nombre del evento.");
    if (!f.start_date || !f.end_date) return void toast.error("Indica inicio y fin.");
    if (!f.city.trim()) return void toast.error("Falta la ciudad.");

    startTransition(async () => {
      const supabase = createClient();
      const payload = {
        name: f.name.trim(),
        event_type: f.event_type,
        status: f.status,
        start_date: localInputToISO(f.start_date),
        end_date: localInputToISO(f.end_date),
        city: f.city.trim(),
        winery_brand: f.winery_brand.trim() || null,
        venue_name: f.venue_name.trim() || null,
        venue_address: f.venue_address.trim() || null,
        venue_map_url: f.venue_map_url.trim() || null,
        venue_contact: f.venue_contact.trim() || null,
        coordinator_id: f.coordinator_id === NONE ? null : f.coordinator_id,
        visit_id: f.visit_id === NONE ? null : f.visit_id,
        max_capacity: f.max_capacity ? Number(f.max_capacity) : null,
        confirmation_deadline: f.confirmation_deadline
          ? localInputToISO(f.confirmation_deadline)
          : null,
        budget_estimated: f.budget_estimated ? Number(f.budget_estimated) : null,
        dress_code_staff: f.dress_code_staff.trim() || null,
        description: f.description.trim() || null,
        notes: f.notes.trim() || null,
      };

      if (isEdit && event) {
        const { error } = await supabase.from("events").update(payload).eq("id", event.id);
        if (error) return void toast.error("No se pudo guardar", { description: error.message });
        toast.success("Evento actualizado");
        router.push(`/eventos/${event.id}`);
      } else {
        const { data, error } = await supabase
          .from("events")
          .insert({ ...payload, created_by: repId })
          .select("id")
          .single();
        if (error) return void toast.error("No se pudo crear", { description: error.message });
        toast.success("Evento creado");
        router.push(`/eventos/${data.id}`);
      }
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label htmlFor="ev-name">Nombre del evento *</Label>
        <Input
          id="ev-name"
          value={f.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Cena maridaje Gerard Bertrand"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Tipo</Label>
          <Select value={f.event_type} onValueChange={(v) => set({ event_type: v as EventType })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Estado</Label>
          <Select value={f.status} onValueChange={(v) => set({ status: v as EventStatus })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EVENT_STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ev-start">Inicio *</Label>
          <Input
            id="ev-start"
            type="datetime-local"
            value={f.start_date}
            onChange={(e) => set({ start_date: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="ev-end">Fin *</Label>
          <Input
            id="ev-end"
            type="datetime-local"
            value={f.end_date}
            onChange={(e) => set({ end_date: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="ev-city">Ciudad *</Label>
          <Input id="ev-city" value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="ev-brand">Marca / Bodega</Label>
          <Input
            id="ev-brand"
            value={f.winery_brand}
            onChange={(e) => set({ winery_brand: e.target.value })}
          />
        </div>
      </div>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Sede</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ev-venue">Lugar</Label>
            <Input
              id="ev-venue"
              value={f.venue_name}
              onChange={(e) => set({ venue_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="ev-vcontact">Contacto de la sede</Label>
            <Input
              id="ev-vcontact"
              value={f.venue_contact}
              onChange={(e) => set({ venue_contact: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ev-vaddr">Dirección</Label>
            <Input
              id="ev-vaddr"
              value={f.venue_address}
              onChange={(e) => set({ venue_address: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ev-vmap">Liga al mapa</Label>
            <Input
              id="ev-vmap"
              value={f.venue_map_url}
              onChange={(e) => set({ venue_map_url: e.target.value })}
              placeholder="https://maps.google.com/…"
            />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Coordinador</Label>
          <Select
            value={f.coordinator_id}
            onValueChange={(v) => set({ coordinator_id: v })}
          >
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
          <Label>Visita de proveedor (opcional)</Label>
          <Select value={f.visit_id} onValueChange={(v) => set({ visit_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Sin visita" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin visita</SelectItem>
              {visits.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.provider_name} · {v.arrival_date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ev-cap">Cupo máximo</Label>
          <Input
            id="ev-cap"
            type="number"
            min={0}
            value={f.max_capacity}
            onChange={(e) => set({ max_capacity: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="ev-deadline">Fecha límite de confirmación</Label>
          <Input
            id="ev-deadline"
            type="datetime-local"
            value={f.confirmation_deadline}
            onChange={(e) => set({ confirmation_deadline: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="ev-budget">Presupuesto estimado</Label>
          <Input
            id="ev-budget"
            type="number"
            min={0}
            value={f.budget_estimated}
            onChange={(e) => set({ budget_estimated: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="ev-dress">Código de vestimenta (staff)</Label>
          <Input
            id="ev-dress"
            value={f.dress_code_staff}
            onChange={(e) => set({ dress_code_staff: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="ev-desc">Descripción</Label>
        <Textarea
          id="ev-desc"
          rows={3}
          value={f.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="ev-notes">Notas internas</Label>
        <Textarea
          id="ev-notes"
          rows={2}
          value={f.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear evento"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
