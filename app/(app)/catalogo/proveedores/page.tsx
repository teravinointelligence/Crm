import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { ProveedorImportClient } from "@/components/products/ProveedorImportClient";

export const metadata = { title: "Cargar proveedores — TERAVINO CRM" };

export default async function CargarProveedoresPage() {
  if (!(await isAdmin())) redirect("/catalogo");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al catálogo
        </Link>
        <h1 className="font-display text-3xl">Cargar proveedores</h1>
        <p className="text-sm text-muted-foreground">
          Asigna a cada producto su proveedor real. Este es el campo con el que se agrupan las
          sugerencias de reabasto y el catálogo, así que cargarlo bien hace que los pedidos de
          restock se consoliden por proveedor. Sube un Excel, revisa los emparejamientos y aplica
          — nada se guarda sin tu confirmación.
        </p>
      </div>
      <ProveedorImportClient />
    </div>
  );
}
