// Portafolios de TERAVINO por zona (Tijuana, Vallarta, La Paz, Los Cabos).
// Un PDF vigente por zona. El admin sube/reemplaza/elimina; el resto del equipo
// con el módulo lo ve y descarga.

import { Briefcase, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PORTAFOLIO_ZONAS, type PortafolioRow } from "@/lib/portafolios";
import { SubirPortafolio } from "@/components/portafolios/SubirPortafolio";
import { EliminarPortafolio } from "@/components/portafolios/EliminarPortafolio";

export const metadata = { title: "Portafolios — TERAVINO CRM" };
export const dynamic = "force-dynamic";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function PortafoliosPage() {
  const rep = await requireRep();
  const isAdmin = rep.role === "admin";

  const supabase = createClient();
  const { data } = await supabase
    .from("portafolios")
    .select("zona, nombre_archivo, pdf_url, storage_path, size_bytes, updated_at");
  const byZona = new Map<string, PortafolioRow>(
    (data ?? []).map((r) => [r.zona, r as PortafolioRow]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Portafolios</h1>
          <p className="text-sm text-muted-foreground">
            Portafolio de vinos en PDF por zona.
            {isAdmin ? " Sube o reemplaza el PDF vigente de cada zona." : " Descarga el de tu zona."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PORTAFOLIO_ZONAS.map((zona) => {
          const pdf = byZona.get(zona.slug);
          return (
            <Card key={zona.slug}>
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Briefcase className="h-5 w-5 text-brand-carmesi" />
                    </span>
                    <div>
                      <p className="font-medium">{zona.nombre}</p>
                      {pdf ? (
                        <p className="text-xs text-muted-foreground">
                          Actualizado {formatDate(pdf.updated_at)}
                          {pdf.size_bytes ? ` · ${formatBytes(pdf.size_bytes)}` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Aún no disponible</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {pdf ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={pdf.pdf_url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-1 h-4 w-4" />
                        Ver / Descargar
                      </a>
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Sin PDF
                    </span>
                  )}
                  {isAdmin && (
                    <>
                      <SubirPortafolio zonaSlug={zona.slug} tienePdf={!!pdf} />
                      {pdf && <EliminarPortafolio zonaSlug={zona.slug} zonaNombre={zona.nombre} />}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
