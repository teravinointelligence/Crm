// Nueva consignación. Server component que pre-carga clientes, productos y
// vendedores desde Base44 y pasa el set inicial al form (client component).

import { Wine } from "lucide-react";
import { requireRep } from "@/lib/auth";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Cliente,
  type Base44Producto,
  type Base44Vendedor,
} from "@/lib/base44";
import { EmptyState } from "@/components/ui/empty-state";
import { ConsignacionForm } from "@/components/consignaciones/ConsignacionForm";

export const metadata = { title: "Nueva consignación — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function NuevaConsignacionPage() {
  const rep = await requireRep();
  const isAdmin = rep.role === "admin";

  // Resolución de vendedor por defecto (para rep, forzado; para admin, sugerido).
  const ownVendedor = await resolveBase44Vendedor(rep.email);
  if (!isAdmin && !ownVendedor) {
    return (
      <EmptyState
        icon={Wine}
        title="Tu usuario no está enlazado a un vendedor en TERAVINO Flow"
        description={`No encontré un Vendedor con email "${rep.email}" en Base44. Pídele a un admin que dé de alta tu correo allá antes de crear consignaciones.`}
      />
    );
  }

  // Datos para los selects. Para clientes preferimos los marcados con tiene_consignacion,
  // pero traemos los demás también por si el equipo aún no los ha marcado.
  let clientes: Base44Cliente[] = [];
  let productos: Base44Producto[] = [];
  let vendedores: Base44Vendedor[] = [];
  let loadError: string | null = null;

  try {
    const [clientesRes, productosRes, vendedoresRes] = await Promise.all([
      base44.entity<Base44Cliente>("Cliente").list({ sort_by: "nombre", limit: 500 }),
      base44.entity<Base44Producto>("Producto").list({
        q: { descontinuado: { $ne: true } },
        sort_by: "nombre",
        limit: 500,
      }),
      isAdmin
        ? base44.entity<Base44Vendedor>("Vendedor").list({
            q: { activo: { $ne: false } },
            sort_by: "nombre",
            limit: 100,
          })
        : Promise.resolve([]),
    ]);
    clientes = clientesRes;
    productos = productosRes;
    vendedores = vendedoresRes;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (loadError) {
    return (
      <EmptyState
        icon={Wine}
        title="No pudimos cargar TERAVINO Flow"
        description={
          loadError.includes("BASE44_API_KEY")
            ? "Falta configurar BASE44_API_KEY en Vercel."
            : loadError
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">Nueva consignación</h1>
        <p className="text-sm text-muted-foreground">
          Registra una consignación de productos. Se crea en estado <em>pendiente</em>;
          ventas, devoluciones y cobros se registran después.
        </p>
      </div>
      <ConsignacionForm
        isAdmin={isAdmin}
        clientes={clientes}
        productos={productos}
        vendedores={vendedores}
        ownVendedor={ownVendedor}
      />
    </div>
  );
}

