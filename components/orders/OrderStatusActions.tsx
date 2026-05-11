"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

const STATUSES = [
  "borrador",
  "enviada",
  "aceptada",
  "rechazada",
  "facturada",
  "entregada",
  "cancelada",
];

export function OrderStatusActions({
  orderId,
  current,
}: {
  orderId: string;
  current: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const changeStatus = (next: string) => {
    if (next === current) return;
    startTransition(async () => {
      const { error } = await supabase
        .from("orders")
        .update({ status: next })
        .eq("id", orderId);
      if (error) {
        toast.error("No pudimos cambiar el status", {
          description: error.message,
        });
        return;
      }
      toast.success("Status actualizado");
      router.refresh();
    });
  };

  return (
    <Select value={current} onValueChange={changeStatus} disabled={pending}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
