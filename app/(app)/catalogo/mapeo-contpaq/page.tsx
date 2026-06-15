import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { MapeoContpaqClient } from "@/components/products/MapeoContpaqClient";

export const metadata = { title: "Mapear códigos CONTPAQ — TERAVINO CRM" };

export default async function MapeoContpaqPage() {
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
        <h1 className="font-display text-3xl">Mapear códigos CONTPAQ</h1>
        <p className="text-sm text-muted-foreground">
          Sube el export de productos de CONTPAQ (código + clave/nombre) para enlazar cada
          producto del catálogo con su código de CONTPAQ. Esto conecta la velocidad de venta
          con el stock y habilita las sugerencias de reabasto. Revisa los emparejamientos
          antes de aplicar — nada se guarda sin tu confirmación.
        </p>
      </div>
      <MapeoContpaqClient />
    </div>
  );
}
