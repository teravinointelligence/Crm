// Cuentas reactivadas: clientes que volvieron a pedir después de ≥N días sin comprar.
// Admin ve todo el equipo; vendedor solo ve las suyas (RLS en la API).

import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SELLER_ROLES } from "@/lib/modules";
import { VentasViewTabs } from "@/components/ventas/VentasViewTabs";
import { ReactivadasClient } from "@/components/ventas/ReactivadasClient";

export const metadata = { title: "Cuentas reactivadas — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function ReactivadasPage({
  searchParams,
}: {
  searchParams: { mes?: string; silencio?: string };
}) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);

  const now = new Date();
  const mesDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = searchParams.mes ?? mesDefault;
  const silencio = Math.min(180, Math.max(7, Number(searchParams.silencio ?? 30)));

  const supabase = isAdmin ? supabaseAdmin() : createClient();
  const { data: repsData } = isAdmin
    ? await supabase
        .from("sales_reps")
        .select("id, full_name")
        .eq("active", true)
        .in("role", SELLER_ROLES)
        .order("full_name")
    : { data: null };
  const reps = (repsData ?? []) as { id: string; full_name: string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Cuentas que volvieron a pedir tras un período de silencio."
              : "Tus clientes que volvieron a comprar este mes."}
          </p>
        </div>
      </div>

      <VentasViewTabs />

      <ReactivadasClient
        isAdmin={isAdmin}
        reps={reps}
        initialMes={mes}
        initialSilencio={silencio}
      />
    </div>
  );
}
