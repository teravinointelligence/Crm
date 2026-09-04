"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CancelSampleButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [reason, setReason] = useState("");

  const confirm = () => {
    startTransition(async () => {
      const res = await fetch(`/api/samples/${requestId}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error("No se pudo solicitar la cancelación", { description: data.error });
        return;
      }
      toast.success("Cancelación enviada a administración");
      setReason("");
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
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <XCircle className="mr-1.5 h-4 w-4" /> Solicitar cancelación
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar cancelación</DialogTitle>
            <DialogDescription>
              Administración revisará el motivo antes de cancelar y ajustar el banco de muestras.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancellation-reason">Motivo</Label>
            <Textarea
              id="cancellation-reason"
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej. El cliente canceló la cita o seleccioné un producto equivocado"
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Volver</Button>
            <Button variant="destructive" disabled={pending || reason.trim().length < 5} onClick={confirm}>
              {pending ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
