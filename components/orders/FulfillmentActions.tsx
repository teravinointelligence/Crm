"use client";

// Control de surtido en el detalle del pedido. Solo se renderiza para
// admin/jefe_logistica. Permite marcar surtido/por surtir y fijar el almacén
// de salida. Es marca operativa: no toca inventario.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WAREHOUSES } from "@/lib/warehouses";

export function FulfillmentActions({
  orderId,
  fulfillmentStatus,
  warehouse,
}: {
  orderId: string;
  fulfillmentStatus: string;
  warehouse: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const surtido = fulfillmentStatus === "surtido";

  const post = (payload: Record<string, unknown>, okMsg: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/orders/${orderId}/surtido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo actualizar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
      <span className="text-xs font-medium text-muted-foreground">Almacén de salida</span>
      <Select
        value={warehouse ?? ""}
        onValueChange={(w) => post({ warehouse: w }, `Almacén: ${w}`)}
        disabled={pending}
      >
        <SelectTrigger className="h-8 w-36">
          <SelectValue placeholder="Sin definir" />
        </SelectTrigger>
        <SelectContent>
          {WAREHOUSES.map((w) => (
            <SelectItem key={w} value={w}>
              {w}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {surtido ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => post({ fulfillment_status: "por_surtir" }, "Marcado por surtir")}
        >
          <PackageOpen className="mr-1 h-4 w-4" /> Marcar por surtir
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => post({ fulfillment_status: "surtido" }, "Pedido surtido")}
        >
          <PackageCheck className="mr-1 h-4 w-4" /> Marcar surtido
        </Button>
      )}
    </div>
  );
}
