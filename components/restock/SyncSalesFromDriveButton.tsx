"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SyncResult = {
  ok?: boolean;
  error?: string;
  fileName?: string;
  customers?: number;
  productLines?: number;
  errors?: number;
};

export function SyncSalesFromDriveButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const sync = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/restock/sync-sales", { method: "POST" });
      const result = await response.json() as SyncResult;
      if (!response.ok || !result.ok) throw new Error(result.error || "No se pudieron actualizar las ventas");
      toast.success("Ventas actualizadas desde Drive", {
        description: `${result.fileName}: ${result.customers} clientes y ${result.productLines} productos${result.errors ? `; ${result.errors} observaciones` : ""}.`,
      });
      router.refresh();
    } catch (error) {
      toast.error("No se actualizaron las ventas", { description: error instanceof Error ? error.message : "Error desconocido" });
    } finally {
      setPending(false);
    }
  };

  return <Button type="button" variant="outline" size="sm" disabled={pending} onClick={sync}>
    <RefreshCw className={`mr-1 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
    {pending ? "Actualizando ventas..." : "Actualizar ventas desde Drive"}
  </Button>;
}
