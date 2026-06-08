"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DOC_STATUS_LABEL, type DocStatus } from "@/lib/documentos-types";

const FLOW: DocStatus[] = ["borrador", "finalizado", "enviado"];

export function DocumentoStatusControl({ id, status }: { id: string; status: DocStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState<DocStatus>(status);
  const [pending, startTransition] = useTransition();

  function setStatus(next: DocStatus) {
    if (next === current) return;
    const prev = current;
    setCurrent(next); // optimista
    startTransition(async () => {
      try {
        const res = await fetch(`/api/documentos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "No se pudo cambiar el estado.");
        }
        toast.success(`Estado: ${DOC_STATUS_LABEL[next]}`);
        router.refresh();
      } catch (e) {
        setCurrent(prev); // revertir
        toast.error(e instanceof Error ? e.message : "Error.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
        <span className="text-muted-foreground">Estado:</span>
        {FLOW.map((st) => (
          <Button
            key={st}
            variant={current === st ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => setStatus(st)}
          >
            {DOC_STATUS_LABEL[st]}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
