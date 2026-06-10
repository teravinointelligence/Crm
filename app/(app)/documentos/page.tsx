// Teravino Docs dentro del CRM: plantillas disponibles + documentos generados.
// Las plantillas y los documentos viven en el app de Base44 "Teravino Docs";
// los datos del cliente salen de Cuentas del CRM al generar.
//
// Scope: admin ve todos los documentos; un vendedor ve los que él generó
// (match por created_by = su email en Base44).

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { formatDate } from "@/lib/utils";
import {
  base44Docs,
  DOC_CATEGORY_LABEL,
  DOC_STATUS_LABEL,
  type Base44DocTemplate,
  type Base44GeneratedDoc,
  type DocStatus,
} from "@/lib/base44-docs";

export const metadata = { title: "Documentos — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<DocStatus, "warning" | "success" | "accent"> = {
  borrador: "warning",
  finalizado: "success",
  enviado: "accent",
};

export default async function DocumentosPage() {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);

  let templates: Base44DocTemplate[] = [];
  let docs: Base44GeneratedDoc[] = [];
  let loadError: string | null = null;

  try {
    const [tpls, generated] = await Promise.all([
      base44Docs.entity<Base44DocTemplate>("DocumentTemplate").list({
        q: { is_active: { $ne: false } },
        sort_by: "name",
        limit: 200,
      }),
      base44Docs.entity<Base44GeneratedDoc>("GeneratedDocument").list({
        q: isAdmin ? {} : { crm_rep_email: rep.email },
        sort_by: "-created_date",
        limit: 200,
      }),
    ]);
    templates = tpls;
    docs = generated;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const notConfigured = loadError?.includes("BASE44_DOCS");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Documentos</h1>
          <p className="text-sm text-muted-foreground">
            Formatos de acuerdos y contratos con clientes (Teravino Docs).
          </p>
        </div>
        <Button asChild disabled={!!loadError}>
          <Link href="/documentos/nuevo">
            <Plus className="mr-1 h-4 w-4" />
            Nuevo documento
          </Link>
        </Button>
      </div>

      {loadError ? (
        <EmptyState
          icon={FileText}
          title={
            notConfigured
              ? "Falta conectar Teravino Docs"
              : "No pudimos cargar Teravino Docs"
          }
          description={
            notConfigured
              ? "Configura BASE44_DOCS_URL y BASE44_DOCS_API_KEY en Vercel (Settings → Environment Variables) para enlazar el app de Base44."
              : loadError ?? undefined
          }
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Plantillas disponibles ({templates.length})
            </h2>
            {templates.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Sin plantillas"
                description="Aún no hay formatos activos en Teravino Docs."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => (
                  <Card key={t.id}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-base leading-tight">{t.name}</h3>
                        <Badge variant="muted">{DOC_CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                      </div>
                      {t.description ? (
                        <p className="line-clamp-3 text-xs text-muted-foreground">{t.description}</p>
                      ) : null}
                      <Button asChild variant="outline" size="sm" className="mt-1">
                        <Link href={`/documentos/nuevo?template=${t.id}`}>Generar con esta</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Documentos generados ({docs.length})
            </h2>
            {docs.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Sin documentos"
                description="Genera tu primer documento eligiendo una plantilla y un cliente."
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left">Fecha</th>
                          <th className="px-4 py-2 text-left">Documento</th>
                          <th className="px-4 py-2 text-left">Cliente</th>
                          <th className="px-4 py-2 text-left">Plantilla</th>
                          <th className="px-4 py-2 text-left">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((d) => (
                          <tr key={d.id} className="border-t hover:bg-muted/20">
                            <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                              {formatDate(d.created_date)}
                            </td>
                            <td className="px-4 py-2">
                              <Link
                                href={`/documentos/${d.id}`}
                                className="text-brand-carmesi hover:underline"
                              >
                                {d.title}
                              </Link>
                            </td>
                            <td className="px-4 py-2">{d.client_name ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground">{d.template_name ?? "—"}</td>
                            <td className="px-4 py-2">
                              <Badge variant={STATUS_VARIANT[d.status ?? "borrador"]}>
                                {DOC_STATUS_LABEL[d.status ?? "borrador"]}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
