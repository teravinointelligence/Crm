"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
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
import { AccountCombobox } from "@/components/accounts/AccountCombobox";
import { cn, isoToLocalInput, localInputToISO } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  type Account,
  type Activity,
  type ActivityStatus,
  type Contact,
} from "@/types/database";

type Props = {
  accounts: Pick<Account, "id" | "business_name" | "region">[];
  contacts?: Contact[];
  repId: string;
  defaultAccountId?: string;
  defaultStatus?: ActivityStatus;
  defaultDate?: string; // YYYY-MM-DD
  /** Si se pasa, el formulario edita esta actividad en lugar de crear una nueva. */
  activity?: Activity;
  onDone?: () => void;
};

function toLocalInput(d: Date) {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
}

function initialDate(status: ActivityStatus, defaultDate?: string) {
  if (defaultDate) return `${defaultDate}T10:00`;
  if (status === "agendada") {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(10, 0, 0, 0);
    return toLocalInput(t);
  }
  return toLocalInput(new Date());
}

export function ActivityForm({
  accounts,
  contacts = [],
  repId,
  defaultAccountId,
  defaultStatus = "realizada",
  defaultDate,
  activity,
  onDone,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = Boolean(activity);
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(activity?.account_id ?? defaultAccountId ?? "");
  const [status, setStatus] = useState<ActivityStatus>(
    (activity?.status as ActivityStatus) ?? defaultStatus,
  );
  const [date, setDate] = useState(() =>
    activity ? isoToLocalInput(activity.activity_date) : initialDate(defaultStatus, defaultDate),
  );
  const [stepDone, setStepDone] = useState(activity?.next_step_done ?? false);

  const agendada = status === "agendada";
  const filteredContacts = contacts.filter((c) => c.account_id === accountId);

  const pickStatus = (next: ActivityStatus) => {
    setStatus(next);
    // Al crear, reajusta la fecha sugerida al cambiar de modo. Al editar, respeta
    // la fecha existente.
    if (!isEdit) setDate(initialDate(next, defaultDate));
  };

  const save = (
    fd: FormData,
    overrideStatus?: ActivityStatus,
    successMsg?: string,
  ) => {
    const effectiveStatus = overrideStatus ?? status;
    // El select de contacto solo se renderiza si la cuenta tiene contactos; si no
    // está en el form, conservamos el contacto previo en vez de borrarlo.
    const rawContact = fd.get("contact_id");
    const contactId =
      rawContact !== null ? (String(rawContact) || null) : (activity?.contact_id ?? null);
    const payload = {
      account_id: accountId,
      contact_id: contactId,
      status: effectiveStatus,
      activity_type: (fd.get("activity_type") as string) || "visita",
      activity_date: localInputToISO(String(fd.get("activity_date"))),
      duration_minutes: fd.get("duration_minutes")
        ? Number(fd.get("duration_minutes"))
        : null,
      outcome: (fd.get("outcome") as string) || null,
      next_step: (fd.get("next_step") as string) || null,
      next_step_date: (fd.get("next_step_date") as string) || null,
      next_step_done: stepDone,
      notes: (fd.get("notes") as string) || null,
      ...(isEdit ? {} : { sales_rep_id: repId }),
    };
    if (!payload.account_id) {
      toast.error("Selecciona la cuenta");
      return;
    }
    startTransition(async () => {
      const { error } = isEdit
        ? await supabase.from("activities").update(payload).eq("id", activity!.id)
        : await supabase.from("activities").insert(payload);
      if (error) {
        toast.error("No pudimos guardar", { description: error.message });
        return;
      }
      toast.success(
        successMsg ??
          (isEdit ? "Actividad actualizada" : agendada ? "Actividad agendada" : "Actividad registrada"),
      );
      if (onDone) onDone();
      router.push(
        effectiveStatus === "agendada" ? "/actividades/calendario" : `/cuentas/${payload.account_id}`,
      );
      router.refresh();
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    save(new FormData(e.currentTarget));
  };

  // En edición: cancelar la cita (estado 'cancelada') conservando los datos.
  const cancelActivity = (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    if (!form) return;
    if (!window.confirm("¿Cancelar esta cita? Quedará marcada como cancelada.")) return;
    save(new FormData(form), "cancelada", "Cita cancelada");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Modo: registrar (ya pasó) vs agendar (a futuro) */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => pickStatus("realizada")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
            !agendada
              ? "border-brand-carmesi bg-brand-carmesi/10 text-brand-carmesi"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          Registrar (ya pasó)
        </button>
        <button
          type="button"
          onClick={() => pickStatus("agendada")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
            agendada
              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <CalendarPlus className="h-4 w-4" />
          Agendar (a futuro)
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="account_id">Cuenta *</Label>
          <AccountCombobox
            id="account_id"
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
          />
        </div>

        {filteredContacts.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="contact_id">Contacto</Label>
            <Select name="contact_id" defaultValue={activity?.contact_id ?? undefined}>
              <SelectTrigger id="contact_id">
                <SelectValue placeholder="(Opcional)" />
              </SelectTrigger>
              <SelectContent>
                {filteredContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name} {c.role ? `· ${c.role}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="activity_type">Tipo</Label>
          <Select name="activity_type" defaultValue={activity?.activity_type ?? "visita"}>
            <SelectTrigger id="activity_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="activity_date">{agendada ? "¿Cuándo?" : "Fecha"} *</Label>
          <Input
            id="activity_date"
            name="activity_date"
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration_minutes">Duración (min)</Label>
          <Input
            id="duration_minutes"
            name="duration_minutes"
            type="number"
            min={0}
            placeholder="30"
            defaultValue={activity?.duration_minutes ?? ""}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="outcome">
            {agendada ? "¿Qué planeas? (opcional)" : "¿Qué pasó?"}
          </Label>
          <Textarea
            id="outcome"
            name="outcome"
            defaultValue={activity?.outcome ?? ""}
            placeholder={
              agendada
                ? "Presentar la nueva colección y dejar muestras…"
                : "Presenté la nueva colección, el cliente está interesado en…"
            }
          />
        </div>

        <div className="space-y-2 sm:col-span-2 rounded-lg border bg-accent/10 p-4">
          <Label htmlFor="next_step" className="font-display text-base">
            Siguiente paso
          </Label>
          <Textarea
            id="next_step"
            name="next_step"
            defaultValue={activity?.next_step ?? ""}
            placeholder="Enviar cotización por 12 botellas Nebbiolo Reserva"
          />
          <div className="space-y-1">
            <Label htmlFor="next_step_date" className="text-xs">
              ¿Cuándo?
            </Label>
            <Input
              id="next_step_date"
              name="next_step_date"
              type="date"
              defaultValue={activity?.next_step_date ?? ""}
            />
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stepDone}
                onChange={(e) => setStepDone(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Siguiente paso completado
            </label>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notas internas</Label>
          <Textarea id="notes" name="notes" defaultValue={activity?.notes ?? ""} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
        {isEdit && activity?.status !== "cancelada" && (
          <Button
            type="button"
            variant="destructive"
            onClick={cancelActivity}
            disabled={pending}
          >
            Cancelar cita
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : agendada
                ? "Agendar actividad"
                : "Registrar actividad"}
        </Button>
      </div>
    </form>
  );
}
