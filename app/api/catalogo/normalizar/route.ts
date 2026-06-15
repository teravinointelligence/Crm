import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { analyzeProduct } from "@/lib/catalogo/normalize.mjs";
import type { NormalizeReport, ProductAnalysis } from "@/lib/catalogo/types";

export const dynamic = "force-dynamic";

// GET: recorre el catálogo y devuelve, por REGLAS, las sugerencias de
// normalización (categoría / país / varietal / añada / formato). NO escribe
// nada. Los productos cuya categoría no se pudo decidir por reglas se marcan
// como `categoryAmbiguous` (candidatos a la sugerencia con IA, aparte).
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  }

  const supabase = createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, sku, name, supplier, category, varietal, country, region_origin, vintage, volume_ml, active")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const analyzed: ProductAnalysis[] = [];
  let ambiguousCount = 0;

  for (const p of products ?? []) {
    const { suggestions, categoryAmbiguous } = analyzeProduct({
      category: p.category,
      name: p.name,
      supplier: p.supplier,
      varietal: p.varietal,
      country: p.country,
      region_origin: p.region_origin,
      vintage: p.vintage,
      volume_ml: p.volume_ml,
      sku: p.sku,
    });

    if (categoryAmbiguous) ambiguousCount += 1;

    // Solo incluimos productos que tengan algo que revisar.
    if (suggestions.length || categoryAmbiguous) {
      analyzed.push({
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        supplier: p.supplier,
        category: p.category,
        suggestions,
        categoryAmbiguous,
      });
    }
  }

  const report: NormalizeReport = {
    total: products?.length ?? 0,
    analyzed,
    ambiguousCount,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(report);
}
