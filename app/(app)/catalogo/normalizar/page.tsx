import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { NormalizarCatalogoClient } from "@/components/products/NormalizarCatalogoClient";

export const metadata = { title: "Normalizar catálogo — TERAVINO CRM" };

export default async function NormalizarPage() {
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
        <h1 className="font-display text-3xl">Normalizar catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Revisa las categorías y datos que el sistema detecta como probablemente
          incorrectos. Nada se modifica hasta que apruebas los cambios.
        </p>
      </div>
      <NormalizarCatalogoClient />
    </div>
  );
}
