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
import { ACTIVITY_TYPES, type Account, type Contact } from "@/types/database";

type Props = {
  accounts: Pick<Account, "id" | "business_name" | "region">[];
  contacts?: Contact[];
  repId: string;
  defaultAccountId?: string;
  onDone?: () => void;
};

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ActivityForm({
  accounts,
  contacts = [],
  repId,
  defaultAccountId,
  onDone,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");

  const filteredContacts = contacts.filter((c) => c.account_id === accountId);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      account_id: accountId,
      contact_id: (fd.get("contact_id") as string) || null,
      sales_rep_id: repId,
      activity_type: (fd.get("activity_type") as string) || "visita",
      activity_date: new Date(
        String(fd.get("activity_date") ?? new Date().toISOString()),
      ).toISOString(),
      duration_minutes: fd.get("duration_minutes")
        ? Number(fd.get("duration_minutes"))
        : null,
      outcome: (fd.get("outcome") as string) || null,
      next_step: (fd.get("next_step") as string) || null,
      next_step_date: (fd.get("next_step_date") as string) || null,
      notes: (fd.get("notes") as string) || null,
    };
    if (!payload.account_id) {
      toast.error("Selecciona la cuenta");
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.from("activities").insert(payload);
      if (error) {
        toast.error("No pudimos guardar", { description: error.message });
        return;
      }
      toast.success("Actividad registrada");
      if (onDone) onDone();
      router.push(`/cuentas/${payload.account_id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="account_id">Cuenta *</Label>
        <Select
          value={accountId}
          onValueChange={setAccountId}
          name="account_id"
        >
          <SelectTrigger id="account_id">
            <SelectValue placeholder="Selecciona cuenta" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.business_name} {a.region ? `· ${a.region}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredContacts.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="contact_id">Contacto</Label>
          <Select name="contact_id">
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
        <Select name="activity_type" defaultValue="visita">
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
        <Label htmlFor="activity_date">Fecha *</Label>
        <Input
          id="activity_date"
          name="activity_date"
          type="datetime-local"
          required
          defaultValue={localNow()}
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
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="outcome">¿Qué pasó?</Label>
        <Textarea
          id="outcome"
          name="outcome"
          placeholder="Presenté la nueva colección, el cliente está interesado en…"
        />
      </div>

      <div className="space-y-2 sm:col-span-2 rounded-lg border bg-accent/10 p-4">
        <Label htmlFor="next_step" className="font-display text-base">
          Siguiente paso
        </Label>
        <Textarea
          id="next_step"
          name="next_step"
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
          />
        </div>
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="notes">Notas internas</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Registrar actividad"}
        </Button>
      </div>
    </form>
  );
}
