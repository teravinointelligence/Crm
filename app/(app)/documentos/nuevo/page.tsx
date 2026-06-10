// Nuevo documento. Server component que pre-carga plantillas (Base44) y cuentas
// del CRM y se las pasa al form (client component). El vendedor ve sus cuentas
// (RLS); el facturista/admin ve todas (service-role) para poder documentar a
// cualquier cliente.

import { FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { base44Docs, type Base44DocTemplate } from "@/lib/base44-docs";
import { NuevoDocumentoForm } from "@/components/documentos/NuevoDocumentoForm";

export const metadata = { title: "Nuevo documento — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function NuevoDocumentoPage({
  searchParams,
}: {
  searchParams: { template?: string };
}) {
  const rep = await requireRep();

  let templates: Base44DocTemplate[] = [];
  let loadError: string | null = null;
  try {
    templates = await base44Docs.entity<Base44DocTemplate>("DocumentTemplate").list({
      q: { is_active: { $ne: false } },
      sort_by: "name",
      limit: 200,
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (loadError) {
    const notConfigured = loadError.includes("BASE44_DOCS");
    return (
      <EmptyState
        icon={FileText}
        title={notConfigured ? "Falta conectar Teravino Docs" : "No pudimos cargar Teravino Docs"}
        description={
          notConfigured
            ? "Configura BASE44_DOCS_URL y BASE44_DOCS_API_KEY en Vercel para enlazar el app de Base44."
            : loadError
        }
      />
    );
  }

  // Cuentas del CRM. Facturista/admin ven todas (service-role); el resto, las
  // suyas (RLS).
  const supabase = canAccessFacturacion(rep.role) ? supabaseAdmin() : createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, business_name, rfc, region")
    .order("business_name", { ascending: true })
    .limit(2000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Nuevo documento</h1>
          <p className="text-sm text-muted-foreground">
            Elige un formato y un cliente; los datos se toman de Cuentas del CRM.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/documentos">Volver</Link>
        </Button>
      </div>

      <NuevoDocumentoForm
        templates={templates.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
        accounts={(accounts ?? []).map((a) => ({
          id: a.id,
          business_name: a.business_name,
          rfc: a.rfc ?? null,
          region: a.region ?? null,
        }))}
        initialTemplateId={searchParams.template ?? ""}
      />
    </div>
  );
}
