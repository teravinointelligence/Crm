"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export type ChecklistRow = {
  id: string;
  item: string;
  is_ready: boolean;
  sort_order: number;
};

export function EventChecklist({
  eventId,
  items,
  canManage,
}: {
  eventId: string;
  items: ChecklistRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");

  const add = () => {
    if (!text.trim()) return;
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_checklist").insert({
        event_id: eventId,
        item: text.trim(),
        sort_order: items.length + 1,
      });
      if (error) return void toast.error("No se pudo agregar", { description: error.message });
      setText("");
      router.refresh();
    });
  };

  const toggle = (row: ChecklistRow) => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("event_checklist")
        .update({ is_ready: !row.is_ready })
        .eq("id", row.id);
      if (error) return void toast.error("No se pudo actualizar", { description: error.message });
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("event_checklist").delete().eq("id", id);
      if (error) return void toast.error("No se pudo eliminar", { description: error.message });
      router.refresh();
    });
  };

  const done = items.filter((i) => i.is_ready).length;

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl">
        Checklist{" "}
        <span className="text-sm font-normal text-muted-foreground">
          ({done}/{items.length})
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sin pendientes.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            >
              <button
                onClick={() => canManage && toggle(row)}
                disabled={!canManage || pending}
                className="flex items-center gap-2 text-left"
              >
                <span
                  className={
                    row.is_ready
                      ? "flex h-5 w-5 items-center justify-center rounded border bg-green-600 text-white"
                      : "flex h-5 w-5 items-center justify-center rounded border"
                  }
                >
                  {row.is_ready && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className={row.is_ready ? "text-muted-foreground line-through" : ""}>
                  {row.item}
                </span>
              </button>
              {canManage && (
                <Button size="icon" variant="ghost" onClick={() => remove(row.id)} disabled={pending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="flex gap-2">
          <Input
            placeholder="Nuevo pendiente…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button size="sm" onClick={add} disabled={pending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
