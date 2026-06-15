"use client";

// Borra un documento generado que sigue en borrador. Reutilizable: en la lista
// (refresca la tabla) y en el detalle (regresa a /documentos al borrar).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteDocumentoButton({
  id,
  title,
  redirectTo,
  variant = "ghost",
  withLabel = false,
}: {
  id: string;
  title?: string;
  /** Si se pasa, navega ahí al borrar; si no, refresca la vista actual. */
  redirectTo?: string;
  variant?: "ghost" | "outline";
  withLabel?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    const label = title ? `"${title}"` : "este documento";
    if (!confirm(`¿Borrar ${label}? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/documentos/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "No se pudo borrar.");
        }
        toast.success("Documento borrado.");
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al borrar.");
      }
    });
  }

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={pending}
      onClick={onDelete}
      className="text-red-600 hover:bg-red-50 hover:text-red-700"
      title="Borrar borrador"
    >
      <Trash2 className="h-4 w-4" />
      {withLabel ? <span className="ml-1">Borrar</span> : <span className="sr-only">Borrar</span>}
    </Button>
  );
}
