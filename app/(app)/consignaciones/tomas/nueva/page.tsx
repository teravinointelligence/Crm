// Nueva toma de inventario para una consignación (?consignacion=<id>).
// Precarga los productos de la consignación con su "cantidad anterior":
// la última toma del cliente (lo que se contó) o, si no hay toma previa, lo
// entregado en la consignación. Scope: admin o el vendedor dueño.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Consignacion,
  type Base44TomaInventario,
} from "@/lib/base44";
import { Button } from "@/components/ui/button";
import { TomaInventarioForm, type TomaItemSeed } from "@/components/consignaciones/TomaInventarioForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva toma de inventario — TERAVINO CRM" };

export default async function NuevaTomaPage({
  searchParams,
}: {
  searchParams: { consignacion?: string };
}) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);
  const consignacionId = searchParams.consignacion;
  if (!consignacionId) redirect("/consignaciones");

  let consignacion: Base44Consignacion;
  try {
    consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(consignacionId);
  } catch {
    notFound();
  }

  if (!isAdmin) {
    const vendedor = await resolveBase44Vendedor(rep.email);
    if (!vendedor || vendedor.id !== consignacion.vendedor_id) notFound();
  }

  // Última toma del cliente → base de "cantidad anterior" por producto.
  let lastTomaItems: NonNullable<Base44TomaInventario["items"]> = [];
  try {
    const tomas = await base44.entity<Base44TomaInventario>("TomaInventario").list({
      q: { cliente_id: consignacion.cliente_id },
      sort_by: "-fecha_toma",
      limit: 1,
    });
    lastTomaItems = tomas[0]?.items ?? [];
  } catch {
    lastTomaItems = [];
  }
  const lastByProduct = new Map(
    lastTomaItems.filter((i) => i.producto_id).map((i) => [i.producto_id as string, i]),
  );

  const seedItems: TomaItemSeed[] = (consignacion.items ?? []).map((it) => {
    const prev = it.producto_id ? lastByProduct.get(it.producto_id) : undefined;
    return {
      producto_id: it.producto_id,
      producto_nombre: it.producto_nombre,
      codigo: prev?.codigo,
      presentacion: prev?.presentacion,
      cantidad_anterior: prev?.cantidad_contada ?? it.cantidad ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/consignaciones/${consignacion.id}`}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Consignación
        </Link>
      </Button>

      <div>
        <h1 className="font-display text-3xl">Nueva toma de inventario</h1>
        <p className="text-sm text-muted-foreground">
          {consignacion.cliente_nombre ?? "Cliente"} · Cuenta a la fecha y firma del encargado.
        </p>
      </div>

      {seedItems.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Esta consignación no tiene productos para contar.
        </div>
      ) : (
        <TomaInventarioForm
          consignacionId={consignacion.id}
          clienteNombre={consignacion.cliente_nombre ?? "Cliente"}
          vendedorNombre={consignacion.vendedor_nombre ?? rep.full_name}
          seedItems={seedItems}
        />
      )}
    </div>
  );
}
