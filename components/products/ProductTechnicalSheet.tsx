"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

type ProductTechnicalSheetProps = {
  productId: string;
  available: boolean;
  fileName: string | null;
  updatedAt: string | null;
  isAdmin: boolean;
};

export function ProductTechnicalSheet({
  productId,
  available,
  fileName,
  updatedAt,
  isAdmin,
}: ProductTechnicalSheetProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const hasSheet = available;

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecciona un archivo PDF");
      return;
    }
    const form = new FormData();
    form.append("pdf", file);
    setBusy(true);
    try {
      const response = await fetch(`/api/catalogo/${productId}/ficha-tecnica`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo subir la ficha");
      toast.success(hasSheet ? "Ficha técnica reemplazada" : "Ficha técnica cargada");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la ficha");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm("¿Eliminar la ficha técnica de este producto?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/catalogo/${productId}/ficha-tecnica`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo eliminar la ficha");
      toast.success("Ficha técnica eliminada");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la ficha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-md bg-brand-carmesi/10 p-2 text-brand-carmesi">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg">Ficha técnica TERAVINO</h2>
            {hasSheet ? (
              <p className="truncate text-sm text-muted-foreground">
                {fileName || "Ficha técnica en PDF"}{updatedAt ? ` · Actualizada ${formatDateTime(updatedAt)}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no se ha cargado una ficha para este producto.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {hasSheet && (
            <Button asChild size="sm" variant="outline">
              <a href={`/api/catalogo/${productId}/ficha-tecnica`}>
                <Download className="mr-1 h-4 w-4" /> Descargar
              </a>
            </Button>
          )}
          {isAdmin && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                {hasSheet ? "Reemplazar" : "Subir ficha"}
              </Button>
              {hasSheet && (
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}>
                  <Trash2 className="mr-1 h-4 w-4" /> Eliminar
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
