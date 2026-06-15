import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PackageCheck, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getRestockSuggestions } from "@/lib/restock-data";
import { SugerenciasRestockClient, type Suggestion } from "@/components/restock/SugerenciasRestockClient";

export const metadata = { title: "Sugerencias de reabasto — TERAVINO CRM" };

export default async function SugerenciasRestockPage() {
  if (!(await isAdmin())) redirect("/restock");
  const supabase = createClient();
  const suggestions = await getRestockSuggestions(supabase);

  // Cobertura del puente CONTPAQ: sin códigos mapeados no hay velocidad y la
  // lista saldría vacía aunque sí haya riesgo. Lo avisamos explícitamente.
  const { count: mappedCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("contpaq_codigo", "is", null);

  const rows: Suggestion[] = suggestions.map((s) => ({
    product_id: s.product_id,
    sku: s.sku,
    name: s.name,
    supplier: s.supplier,
    stock: s.stock,
    velocityPerMonth: s.velocityPerMonth,
    daysOfCover: s.daysOfCover == null ? null : Math.round(s.daysOfCover),
    leadDays: s.leadDays,
    suggestedQty: s.suggestedQty,
    orderByInDays: s.orderByInDays,
    urgency: s.urgency,
    reason: s.reason,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/restock"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Restock
        </Link>
        <h1 className="font-display text-3xl">Sugerencias de reabasto</h1>
        <p className="text-sm text-muted-foreground">
          Productos que van a quebrar stock antes de poder reabastecer, según su velocidad
          de venta, stock actual y lead time. Revisa, ajusta y conviértelos en un pedido de
          restock (entra a la bandeja de revisión). El modelo es transparente: cada fila explica su porqué.
        </p>
      </div>

      {!mappedCount ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-3 py-6">
            <div className="flex items-center gap-2 font-medium text-amber-900">
              <Link2 className="h-5 w-5" /> Falta conectar el catálogo con CONTPAQ
            </div>
            <p className="text-sm text-amber-900">
              Ningún producto tiene su código de CONTPAQ asignado, así que aún no se puede
              cruzar la velocidad de venta con el stock. Sube el export de CONTPAQ para
              habilitar las sugerencias de reabasto.
            </p>
            <Button asChild>
              <Link href="/catalogo/mapeo-contpaq">
                <Link2 className="mr-1 h-4 w-4" /> Mapear códigos CONTPAQ
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : !rows.length ? (
        <EmptyState
          icon={PackageCheck}
          title="Sin riesgos de quiebre"
          description={`Ningún producto activo está en riesgo de agotarse antes de su reabasto. El cálculo usa los últimos 3 meses de ventas (${mappedCount} productos con código CONTPAQ).`}
        />
      ) : (
        <SugerenciasRestockClient suggestions={rows} />
      )}
    </div>
  );
}
