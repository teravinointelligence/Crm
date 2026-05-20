// Visor de un manual. Embebe el preview de Google Drive en un iframe — solo
// lectura. La opción de descarga se controla en los permisos del archivo en
// Drive (deshabilitar "los lectores pueden descargar/imprimir/copiar").

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Sop } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ManualViewerPage({ params }: { params: { id: string } }) {
  await requireRep();
  const supabase = createClient();
  const { data } = await supabase
    .from("sops")
    .select("*")
    .eq("id", params.id)
    .eq("active", true)
    .maybeSingle();
  const sop = data as Sop | null;
  if (!sop) notFound();

  const previewUrl = `https://drive.google.com/file/d/${sop.drive_file_id}/preview`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/manuales">
              <ArrowLeft className="h-4 w-4" />
              <span className="ml-1">Manuales</span>
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl">{sop.title}</h1>
            {sop.category && (
              <Badge variant="muted" className="mt-1 text-[10px] uppercase">{sop.category}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <iframe
          src={previewUrl}
          title={sop.title}
          className="h-[80vh] w-full"
          allow="autoplay"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Documento de solo lectura. Si necesitas una copia, solicítala a Dirección.
      </p>
    </div>
  );
}
