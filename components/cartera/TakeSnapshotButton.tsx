"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/** Toma un snapshot de cartera de TODOS los clientes al corte de hoy.
 *  Alimenta la Sección 4 (evolución del saldo por corte). */
export function TakeSnapshotButton() {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const { data, error } = await supabase.rpc("take_balance_snapshot");
      if (error) {
        toast.error("No pudimos tomar el snapshot", { description: error.message });
        return;
      }
      toast.success(`Snapshot tomado · ${data ?? 0} clientes con saldo`);
      router.refresh();
    });
  };

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      <Camera className="mr-1 h-4 w-4" />
      {pending ? "Tomando…" : "Tomar corte"}
    </Button>
  );
}
