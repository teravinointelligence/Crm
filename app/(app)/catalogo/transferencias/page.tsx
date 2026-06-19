// Solicitudes de transferencia entre almacenes. El vendedor ve las suyas; el
// admin las ve todas y las aprueba / rechaza / marca completadas. (RLS).

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { TransferenciasClient } from "@/components/products/TransferenciasClient";
import type { TransferRequest } from "@/lib/warehouse-transfers";

export const metadata = { title: "Transferencias entre almacenes — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function TransferenciasPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const isAdmin = rep.role === "admin";
  if (!isAdmin && rep.role !== "rep") redirect("/catalogo");

  const supabase = createClient();
  const { data } = await supabase
    .from("warehouse_transfer_requests")
    .select("*, requester:requested_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);

  const requests: TransferRequest[] = (data ?? []).map((r: any) => ({
    id: r.id,
    product_id: r.product_id,
    product_label: r.product_label,
    from_warehouse: r.from_warehouse,
    to_warehouse: r.to_warehouse,
    quantity: Number(r.quantity),
    reason: r.reason,
    status: r.status,
    admin_notes: r.admin_notes,
    created_at: r.created_at,
    decided_at: r.decided_at,
    requested_by: r.requested_by,
    requester_name: r.requester?.full_name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Transferencias entre almacenes</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Aprueba o rechaza las solicitudes de transferencia de los vendedores."
              : "Tus solicitudes de transferencia entre almacenes."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/catalogo">
              <Plus className="mr-1 h-4 w-4" /> Nueva solicitud (en el catálogo)
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/catalogo">
              <ArrowLeft className="mr-1 h-4 w-4" /> Volver al catálogo
            </Link>
          </Button>
        </div>
      </div>
      <TransferenciasClient requests={requests} isAdmin={isAdmin} />
    </div>
  );
}
