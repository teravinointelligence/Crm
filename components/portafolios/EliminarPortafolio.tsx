"use client";

// Botón admin para eliminar el portafolio vigente de una zona.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EliminarPortafolio({ zonaSlug, zonaNombre }: { zonaSlug: string; zonaNombre: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    if (!confirm(`¿Eliminar el portafolio de ${zonaNombre}?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/portafolios/${zonaSlug}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo eliminar", { description: json.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Portafolio eliminado");
      router.refresh();
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onDelete}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="mr-1 h-4 w-4" />
      {pending ? "Eliminando…" : "Eliminar"}
    </Button>
  );
}
