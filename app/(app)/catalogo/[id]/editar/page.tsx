import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { ProductForm } from "@/components/products/ProductForm";

export const metadata = { title: "Editar producto — TERAVINO CRM" };

export default async function EditarProductoPage({
  params,
}: {
  params: { id: string };
}) {
  if (!(await isAdmin())) redirect("/catalogo");
  const supabase = createClient();
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!product) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl">Editar producto</h1>
      <ProductForm product={product} />
    </div>
  );
}
