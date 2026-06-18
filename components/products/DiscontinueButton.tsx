"use client";

// Marca/desmarca un producto como descontinuado. Al descontinuar NO se toca
// `active`: el producto sigue vendible mientras tenga stock (liquidación,
// "últimas botellas") y solo se oculta del catálogo cuando se agota. Al
// reactivar se limpia el estado. Solo admin (RLS products_admin_write).
// Reusado en la ficha del producto y en la lista de descontinuados.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function DiscontinueButton({
  productId,
  productName,
  discontinued,
  repId,
  size = "default",
}: {
  productId: string;
  productName: string;
  discontinued: boolean;
  repId: string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (!discontinued) {
      if (
        !confirm(
          `¿Descontinuar "${productName}"? Seguirá vendible en liquidación mientras tenga stock; se ocultará del catálogo al agotarse.`,
        )
      )
        return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const payload = discontinued
        ? { discontinued_at: null, discontinued_by: null }
        : { discontinued_at: new Date().toISOString(), discontinued_by: repId };
      const { error } = await supabase.from("products").update(payload).eq("id", productId);
      if (error) {
        toast.error(discontinued ? "No se pudo reactivar" : "No se pudo descontinuar", {
          description: error.message,
        });
        return;
      }
      toast.success(discontinued ? "Producto reactivado" : "Producto descontinuado");
      router.refresh();
    });
  };

  return (
    <Button
      variant="outline"
      size={size}
      onClick={run}
      disabled={pending}
      className={discontinued ? "" : "text-destructive hover:text-destructive"}
    >
      {discontinued ? (
        <>
          <RotateCcw className="mr-1 h-4 w-4" /> {pending ? "Reactivando…" : "Reactivar"}
        </>
      ) : (
        <>
          <Ban className="mr-1 h-4 w-4" /> {pending ? "Descontinuando…" : "Descontinuar"}
        </>
      )}
    </Button>
  );
}
