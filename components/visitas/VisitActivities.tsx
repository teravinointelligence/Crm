"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountCombobox } from "@/components/accounts/AccountCombobox";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import {
  ACTIVITY_STATUS_BADGE,
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_TYPE_OPTIONS,
  type AccountOption,
  type ActivityStatus,
  type ActivityType,
  type VisitActivity,
} from "@/lib/visitas/constants";

const NONE = "__none__";

type Draft = {
  id?: string;
  day_date: string;
  start_time: string;
  end_time: string;
  activity_type: ActivityType;
  title: string;
  account_id: string;
  client_name: string;
  location: string;
  status: ActivityStatus;
  notes: string;
};

function emptyDraft(defaultDay: string): Draft {
  return {
    day_date: defaultDay,
    start_time: "",
    end_time: "",
    activity_type: "comida",
    title: "",
    account_id: NONE,
    client_name: "",
    location: "",
    status: "pending",
    notes: "",
  };
}

export function VisitActivities({
  visitId,
  arrivalDate,
  departureDate,
  activities,
  accounts,
  repId,
  canEdit,
}: {
  visitId: string;
  arrivalDate: string;
  departureDate: string;
  activities: VisitActivity[];
  accounts: AccountOption[];
  repId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(arrivalDate));

  const accountName = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, a.business_name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [accounts]);

  const byDay = useMemo(() => {
    const groups = new Map<string, VisitActivity[]>();
    for (const a of activities) {
      const arr = groups.get(a.day_date) ?? [];
      arr.push(a);
      groups.set(a.day_date, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((x, y) => (x.start_time ?? "99").localeCompare(y.start_time ?? "99"));
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [activities]);

  const openNew = (day?: string) => {
    setDraft(emptyDraft(day ?? arrivalDate));
    setOpen(true);
  };

  const openEdit = (a: VisitActivity) => {
    setDraft({
      id: a.id,
      day_date: a.day_date,
      start_time: a.start_time?.slice(0, 5) ?? "",
      end_time: a.end_time?.slice(0, 5) ?? "",
      activity_type: a.activity_type,
      title: a.title,
      account_id: a.account_id ?? NONE,
      client_name: a.client_name ?? "",
      location: a.location ?? "",
      status: a.status,
      notes: a.notes ?? "",
    });
    setOpen(true);
  };

  const save = () => {
    if (!draft.title.trim()) return void toast.error("Ponle un título a la actividad.");
    if (!draft.day_date) return void toast.error("Elige el día.");
    startTransition(async () => {
      const supabase = createClient();
      const accountId = draft.account_id === NONE ? null : draft.account_id;
      const payload = {
        visit_id: visitId,
        day_date: draft.day_date,
        start_time: draft.start_time || null,
        end_time: draft.end_time || null,
        activity_type: draft.activity_type,
        title: draft.title.trim(),
        account_id: accountId,
        client_name: accountId ? null : draft.client_name.trim() || null,
        location: draft.location.trim() || null,
        status: draft.status,
        notes: draft.notes.trim() || null,
      };
      const { error } = draft.id
        ? await supabase.from("visit_activities").update(payload).eq("id", draft.id)
        : await supabase.from("visit_activities").insert({ ...payload, created_by: repId });
      if (error) return void toast.error("No se pudo guardar", { description: error.message });
      toast.success(draft.id ? "Actividad actualizada" : "Actividad agregada");
      setOpen(false);
      router.refresh();
    });
  };

  const remove = (a: VisitActivity) => {
    if (!confirm(`¿Eliminar "${a.title}"?`)) return;
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("visit_activities").delete().eq("id", a.id);
      if (error) return void toast.error("No se pudo eliminar", { description: error.message });
      toast.success("Actividad eliminada");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Agenda</h2>
        {canEdit && (
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="mr-1 h-4 w-4" /> Agregar actividad
          </Button>
        )}
      </div>

      {byDay.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sin actividades agendadas todavía.
        </p>
      ) : (
        byDay.map(([day, items]) => (
          <div key={day} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold capitalize text-muted-foreground">
                {formatDate(day)}
              </h3>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => openNew(day)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {items.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.start_time && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium">
                          <Clock className="h-3.5 w-3.5" />
                          {a.start_time.slice(0, 5)}
                        </span>
                      )}
                      <Badge variant="muted">{ACTIVITY_TYPE_LABEL[a.activity_type]}</Badge>
                      <Badge variant={ACTIVITY_STATUS_BADGE[a.status]}>
                        {ACTIVITY_STATUS_LABEL[a.status]}
                      </Badge>
                    </div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {accountName(a.account_id) ?? a.client_name ?? "—"}
                      {a.location && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {a.location}
                        </span>
                      )}
                    </p>
                    {a.notes && <p className="text-sm text-muted-foreground">{a.notes}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(a)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar actividad" : "Nueva actividad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="d-day">Día *</Label>
                <Input
                  id="d-day"
                  type="date"
                  min={arrivalDate}
                  max={departureDate}
                  value={draft.day_date}
                  onChange={(e) => setDraft({ ...draft, day_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select
                  value={draft.activity_type}
                  onValueChange={(v) => setDraft({ ...draft, activity_type: v as ActivityType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="d-start">Inicio</Label>
                <Input
                  id="d-start"
                  type="time"
                  value={draft.start_time}
                  onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="d-end">Fin</Label>
                <Input
                  id="d-end"
                  type="time"
                  value={draft.end_time}
                  onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="d-title">Título *</Label>
              <Input
                id="d-title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Cena maridaje en…"
              />
            </div>
            <div>
              <Label>Cliente (cuenta)</Label>
              <AccountCombobox
                accounts={accounts}
                value={draft.account_id}
                onChange={(id) => setDraft({ ...draft, account_id: id })}
                noneValue={NONE}
                noneLabel="Sin cuenta / otro"
              />
              {draft.account_id === NONE && (
                <Input
                  className="mt-2"
                  value={draft.client_name}
                  onChange={(e) => setDraft({ ...draft, client_name: e.target.value })}
                  placeholder="Nombre del cliente (texto libre)"
                />
              )}
            </div>
            <div>
              <Label htmlFor="d-loc">Lugar</Label>
              <Input
                id="d-loc"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="Restaurante / hotel / sede"
              />
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft({ ...draft, status: v as ActivityStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_STATUS_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="d-notes">Notas</Label>
              <Textarea
                id="d-notes"
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
