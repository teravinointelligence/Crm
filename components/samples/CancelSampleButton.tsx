"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CancelSampleButton({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const isApproved = status === "aprobada";

  const confirm = () => {
    startTransition(async () => {
      const res = await fetch(`/api/samples/${requestId}/cancelar`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error("No se pudo cancelar", { description: data.error });
        return;
      }
      toast.success("Solicitud cancelada");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 border-red-200 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <XCircle className="mr-1.5 h-4 w-4" /> Cancelar solicitud
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta solicitud?</DialogTitle>
            <DialogDescription>
              {isApproved
                ? "Esta solicitud ya estaba aprobada. Al cancelarla se revertirán los vinos que se registraron en el banco de muestras. Esta acción no se puede deshacer."
                : "La solicitud pasará a estado «cancelada» y ya no podrá procesarse. Esta acción no se puede deshacer."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Volver</Button>
            <Button variant="destructive" onClick={confirm}>Sí, cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
