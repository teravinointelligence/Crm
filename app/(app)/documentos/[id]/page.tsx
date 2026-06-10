// Detalle de un documento generado: texto completo, control de estado y
// descarga en PDF. El documento vive en el app de Base44 "Teravino Docs".

import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { formatDateTime } from "@/lib/utils";
import { base44Docs, type Base44GeneratedDoc } from "@/lib/base44-docs";
import { DocumentoStatusControl } from "@/components/documentos/DocumentoStatusControl";

export const metadata = { title: "Documento — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function DocumentoDetallePage({ params }: { params: { id: string } }) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);

  let doc: Base44GeneratedDoc | null = null;
  let loadError: string | null = null;
  try {
    doc = await base44Docs.entity<Base44GeneratedDoc>("GeneratedDocument").get(params.id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (loadError?.includes("BASE44_DOCS")) {
    return (
      <EmptyState
        icon={FileText}
        title="Falta conectar Teravino Docs"
        description="Configura BASE44_DOCS_URL y BASE44_DOCS_API_KEY en Vercel para enlazar el app de Base44."
      />
    );
  }
  if (!doc) notFound();
  // Cada quien ve los suyos: un vendedor no abre por id un documento de otro.
  if (!isAdmin && doc.crm_rep_email !== rep.email) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl leading-tight">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">
            {doc.template_name ?? "Documento"}
            {doc.client_name ? ` · ${doc.client_name}` : ""}
            {doc.created_date ? ` · ${formatDateTime(doc.created_date)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/documentos">Volver</Link>
          </Button>
          <Button asChild>
            <a href={`/api/documentos/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="mr-1 h-4 w-4" />
              Descargar PDF
            </a>
          </Button>
        </div>
      </div>

      <DocumentoStatusControl id={doc.id} status={doc.status ?? "borrador"} />

      <Card>
        <CardContent className="p-6">
          <pre className="whitespace-pre-wrap break-words font-serif text-sm leading-relaxed text-foreground">
            {doc.content}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
