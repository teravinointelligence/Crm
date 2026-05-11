import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { ProductsListClient } from "@/components/products/ProductsListClient";

export const metadata = { title: "Catálogo — TERAVINO CRM" };

export default async function CatalogoPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const { data } = await supabase
    .from("products")
    .select("*")
    .order("supplier")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Vinos y destilados de TERAVINO. Los precios mostrados son antes de IVA.
        </p>
      </div>
      <ProductsListClient products={data ?? []} isAdmin={!!isAdmin} />
    </div>
  );
}
