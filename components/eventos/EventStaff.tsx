"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { RepOption } from "@/lib/visitas/constants";

export type StaffRow = {
  id: string;
  sales_rep_id: string;
  role_in_event: string | null;
  rep: { full_name: string | null } | null;
};

export function EventStaff({
  eventId,
  staff,
  reps,
  canManage,
}: {
  eventId: string;
  staff: StaffRow[];
  reps: RepOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [repId, setRepId] = useState("");
  const [role, setRole] = useState("");

  const add = () => {
    if (!repId) return void toast.error("Elige a un integrante.");
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_staff").insert({
        event_id: eventId,
        sales_rep_id: repId,
        role_in_event: role.trim() || null,
      });
      if (error) return void toast.error("No se pudo agregar", { description: error.message });
      setRepId("");
      setRole("");
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_staff").delete().eq("id", id);
      if (error) return void toast.error("No se pudo eliminar", { description: error.message });
      router.refresh();
    });
  };

  const assignedIds = new Set(staff.map((s) => s.sales_rep_id));
  const available = reps.filter((r) => !assignedIds.has(r.id));

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl">Staff del evento</h2>
      {staff.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sin staff asignado.
        </p>
      ) : (
        <ul className="space-y-1">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            >
              <span className="inline-flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {s.rep?.full_name ?? "—"}
                {s.role_in_event && (
                  <span className="text-sm text-muted-foreground">· {s.role_in_event}</span>
                )}
              </span>
              {canManage && (
                <Button size="icon" variant="ghost" onClick={() => remove(s.id)} disabled={pending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && available.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={repId} onValueChange={setRepId}>
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="Integrante" />
            </SelectTrigger>
            <SelectContent>
              {available.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name ?? "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Rol (ej. sommelier)" value={role} onChange={(e) => setRole(e.target.value)} />
          <Button size="sm" onClick={add} disabled={pending}>
            <Plus className="mr-1 h-4 w-4" /> Agregar
          </Button>
        </div>
      )}
    </div>
  );
}
