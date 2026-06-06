import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { ProductForm } from "@/components/products/ProductForm";

export const metadata = { title: "Nuevo producto — TERAVINO CRM" };

export default async function NuevoProductoPage() {
  if (!(await isAdmin())) redirect("/catalogo");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl">Nuevo producto</h1>
      <ProductForm />
    </div>
  );
}
