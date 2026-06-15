import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { suggestProductCategory } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

// POST: respaldo de IA SOLO para los productos ambiguos seleccionados.
// Body: { product_ids: string[] }. Devuelve sugerencias de categoría (la IA
// SUGIERE; el admin aprueba después en la UI). Tope de seguridad de tamaño.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  }

  let body: { product_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const ids = Array.isArray(body.product_ids)
    ? [...new Set(body.product_ids.map(String))].slice(0, 60)
    : [];
  if (!ids.length) {
    return NextResponse.json({ error: "No se enviaron productos." }, { status: 400 });
  }

  const supabase = createClient();
  // Enviamos a la IA solo lo necesario: nombre, proveedor, varietal.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, supplier, varietal")
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const suggestions = await suggestProductCategory(
      (products ?? []).map((p) => ({
        product_id: p.id,
        name: p.name,
        supplier: p.supplier,
        varietal: p.varietal,
      })),
    );
    return NextResponse.json({ suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al consultar la IA.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
