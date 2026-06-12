"use client";

// Botón para adjuntar (o reemplazar) el PDF del documento de un pedido de
// Reparto — factura, traspaso de almacén, consignación, patrocinio…
// Sube a /api/reparto/pedidos/[id]/pdf y refresca el detalle.

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubirPdfPedido({ pedidoId, tienePdf }: { pedidoId: string; tienePdf: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | null) => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch(`/api/reparto/pedidos/${pedidoId}/pdf`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo subir el PDF", { description: json.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success(tienePdf ? "PDF reemplazado" : "PDF adjuntado");
      router.refresh();
    });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
        <FileUp className="mr-1 h-4 w-4" />
        {pending ? "Subiendo…" : tienePdf ? "Reemplazar PDF" : "Subir PDF"}
      </Button>
    </>
  );
}
