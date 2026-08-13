// Planogramas: mapa de acomodo de las bodegas de TERAVINO.
// Los datos viven en la app Base44 "Teravino Map" (teravino-planogramas.base44.app);
// el CRM los muestra en SOLO CONSULTA para que el equipo sepa dónde está cada
// vino sin pedirle a nadie que abra otra app. La captura sigue en Base44.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Grid3x3, ExternalLink, Boxes, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentRep } from "@/lib/auth";
import { canViewPlanogramas } from "@/lib/modules";
import {
  PLANOGRAMAS_APP_URL,
  accentHex,
  botellasDeCaja,
  construirIndice,
  listarBodegas,
  listarCajas,
  listarPosiciones,
  type PlanoBodega,
  type PlanoCaja,
  type PlanoPosicion,
} from "@/lib/base44-planogramas";
import { BuscadorVino } from "@/components/planogramas/BuscadorVino";

export const metadata = { title: "Planogramas — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function PlanogramasPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewPlanogramas(rep.role)) redirect("/");

  let bodegas: PlanoBodega[] = [];
  let posiciones: PlanoPosicion[] = [];
  let cajas: PlanoCaja[] = [];
  let loadError: string | null = null;
  try {
    [bodegas, posiciones, cajas] = await Promise.all([
      listarBodegas(),
      listarPosiciones(),
      listarCajas(),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  // Distinguimos "faltan los secretos" de "el app respondió mal", para no
  // mandar a Sabrina a Vercel cuando el problema es otro.
  const noConfigurado = loadError?.includes("BASE44") ?? false;

  const indice = construirIndice(bodegas, posiciones, cajas);
  const botellasTotales = indice.reduce((acc, h) => acc + h.botellas, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Planogramas</h1>
          <p className="text-sm text-muted-foreground">
            Cómo está acomodada cada bodega: qué vino vive en cada rack y en cada tarima.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={PLANOGRAMAS_APP_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" />
            Editar en Teravino Map
          </a>
        </Button>
      </div>

      {loadError ? (
        <EmptyState
          icon={Grid3x3}
          title={noConfigurado ? "Falta conectar Teravino Map" : "No pudimos cargar los planogramas"}
          description={
            noConfigurado
              ? "Configura BASE44_PLANOGRAMAS_API_KEY (o BASE44_API_KEY) en Vercel → Settings → Environment Variables para enlazar el app de Base44."
              : loadError
          }
        />
      ) : bodegas.length === 0 ? (
        <EmptyState
          icon={Grid3x3}
          title="Sin bodegas"
          description="Todavía no hay bodegas dadas de alta en Teravino Map."
        />
      ) : (
        <>
          <BuscadorVino indice={indice} />

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="muted">
              {bodegas.length} bodega{bodegas.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="muted">{indice.length} ubicaciones ocupadas</Badge>
            <Badge variant="muted">{botellasTotales} botellas acomodadas</Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bodegas.map((b) => {
              const pos = posiciones.filter((p) => p.bodega_id === b.id);
              const caj = cajas.filter((c) => c.bodega_id === b.id);
              const sueltas = pos.reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0);
              const enTarimas = caj.reduce((acc, c) => acc + botellasDeCaja(c), 0);
              const huecos = (Number(b.numero_racks) || 1) * b.filas * b.columnas;
              const ocupados = new Set(pos.map((p) => `${Number(p.rack) || 1}-${p.fila}-${p.columna}`)).size;
              const hex = accentHex(b.color_acento);

              return (
                <Link key={b.id} href={`/planogramas/${b.id}`} className="block">
                  <Card className="h-full transition-colors hover:border-brand-carmesi/50">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-white"
                          style={{ backgroundColor: hex }}
                          aria-hidden
                        >
                          <Grid3x3 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-display text-base leading-tight">{b.nombre}</h3>
                          <p className="text-xs text-muted-foreground">
                            {b.numero_racks} rack{b.numero_racks === 1 ? "" : "s"} de {b.filas}×
                            {b.columnas}
                            {b.filas_tarimas
                              ? ` · ${b.filas_tarimas}×${b.tarimas_por_fila ?? 0} tarimas`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <dl className="space-y-0.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="flex items-center gap-1 text-muted-foreground">
                            <Wine className="h-3 w-3" /> En racks
                          </dt>
                          <dd>{sueltas} bot.</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="flex items-center gap-1 text-muted-foreground">
                            <Boxes className="h-3 w-3" /> En tarimas
                          </dt>
                          <dd>{enTarimas} bot.</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Huecos ocupados</dt>
                          <dd>
                            {ocupados} / {huecos}
                          </dd>
                        </div>
                      </dl>

                      {b.descripcion ? (
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">
                          {b.descripcion}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
