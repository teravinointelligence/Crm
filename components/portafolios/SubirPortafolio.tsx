"use client";

// Botón admin para subir (o reemplazar) el PDF del portafolio de una zona.
// Sube a /api/portafolios/[zona] y refresca la lista.

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubirPortafolio({ zonaSlug, tienePdf }: { zonaSlug: string; tienePdf: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | null) => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch(`/api/portafolios/${zonaSlug}`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo subir el portafolio", { description: json.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success(tienePdf ? "Portafolio reemplazado" : "Portafolio subido");
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
        {pending ? "Subiendo…" : tienePdf ? "Reemplazar" : "Subir PDF"}
      </Button>
    </>
  );
}
