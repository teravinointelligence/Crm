// Detalle de una bodega: el plano completo (racks + tarimas) en solo consulta.

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentRep } from "@/lib/auth";
import { canViewPlanogramas } from "@/lib/modules";
import {
  PLANOGRAMAS_APP_URL,
  accentHex,
  listarCajas,
  listarPosiciones,
  obtenerBodega,
  totalBotellas,
  type PlanoBodega,
  type PlanoCaja,
  type PlanoPosicion,
} from "@/lib/base44-planogramas";
import { BodegaPlano } from "@/components/planogramas/BodegaPlano";

export const metadata = { title: "Planograma de bodega — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function PlanogramaBodegaPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewPlanogramas(rep.role)) redirect("/");

  let bodega: PlanoBodega | null = null;
  let posiciones: PlanoPosicion[] = [];
  let cajas: PlanoCaja[] = [];
  let loadError: string | null = null;
  try {
    [bodega, posiciones, cajas] = await Promise.all([
      obtenerBodega(id),
      listarPosiciones(id),
      listarCajas(id),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // Un 404 de Base44 es "esa bodega ya no existe", no un error de la pantalla.
  if (loadError?.includes(" 404 ")) notFound();

  if (loadError || !bodega) {
    const noConfigurado = loadError?.includes("BASE44") ?? false;
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/planogramas">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Planogramas
          </Link>
        </Button>
        <EmptyState
          icon={Grid3x3}
          title={noConfigurado ? "Falta conectar Teravino Map" : "No pudimos cargar la bodega"}
          description={
            noConfigurado
              ? "Configura BASE44_PLANOGRAMAS_API_KEY (o BASE44_API_KEY) en Vercel → Settings → Environment Variables."
              : loadError ?? undefined
          }
        />
      </div>
    );
  }

  const hex = accentHex(bodega.color_acento);
  const botellas = totalBotellas(posiciones, cajas);
  const huecos = (Number(bodega.numero_racks) || 1) * bodega.filas * bodega.columnas;
  const ocupados = new Set(
    posiciones.map((p) => `${Number(p.rack) || 1}-${p.fila}-${p.columna}`),
  ).size;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/planogramas">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Planogramas
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-white"
            style={{ backgroundColor: hex }}
            aria-hidden
          >
            <Grid3x3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-3xl">{bodega.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              {bodega.descripcion || "Toca un hueco ocupado para ver qué hay ahí."}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <a href={PLANOGRAMAS_APP_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" />
            Editar en Teravino Map
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="muted">{botellas} botellas</Badge>
        <Badge variant="muted">
          {ocupados} / {huecos} huecos de rack
        </Badge>
        {cajas.length > 0 ? (
          <Badge variant="muted">
            {cajas.length} tarima{cajas.length === 1 ? "" : "s"} con producto
          </Badge>
        ) : null}
      </div>

      {posiciones.length === 0 && cajas.length === 0 ? (
        <EmptyState
          icon={Grid3x3}
          title="Bodega vacía"
          description="Esta bodega existe pero todavía no tiene nada acomodado en Teravino Map."
        />
      ) : (
        <BodegaPlano bodega={bodega} posiciones={posiciones} cajas={cajas} accent={hex} />
      )}
    </div>
  );
}
