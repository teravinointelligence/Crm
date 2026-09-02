"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function SampleCancellationActions({
  requestId,
  reason,
}: {
  requestId: string;
  reason: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const decide = (approve: boolean) => startTransition(async () => {
    const response = await fetch(`/api/samples/${requestId}/cancelacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, notes }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast.error("No se pudo resolver la cancelación", { description: result.error });
      return;
    }
    toast.success(approve ? "Cancelación aprobada" : "Cancelación rechazada");
    router.refresh();
  });
  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardContent className="space-y-3 p-6">
        <div>
          <h3 className="font-display text-lg">Cancelación pendiente</h3>
          <p className="text-sm"><strong>Motivo del vendedor:</strong> {reason}</p>
        </div>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Comentario para el vendedor (opcional)"
          maxLength={2000}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => decide(false)}>
            Rechazar cancelación
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => decide(true)}>
            Aprobar cancelación
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
