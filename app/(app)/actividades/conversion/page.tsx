// Tasa de conversión visita → pedido por vendedor.
// Admin ve a todos; el vendedor solo ve la suya.

import Link from "next/link";
import { TrendingUp, Target } from "lucide-react";
import { requireRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SELLER_ROLES } from "@/lib/modules";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActivityViewTabs } from "@/components/activities/ActivityViewTabs";
import { ConversionClient } from "@/components/activities/ConversionClient";

export const metadata = { title: "Conversión — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function ConversionPage({
  searchParams,
}: {
  searchParams: { dias?: string; rep?: string };
}) {
  const rep = await requireRep();
  const isAdmin = canAccessFacturacion(rep.role);
  const dias = Math.min(180, Math.max(7, Number(searchParams.dias ?? 90)));
  const repFilter = isAdmin ? (searchParams.rep ?? null) : null;

  const supabase = isAdmin ? supabaseAdmin() : createClient();

  // Vendedores para el filtro admin
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
          <h1 className="font-display text-3xl">Actividades</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Conversión del equipo: visitas realizadas que generaron un pedido."
              : "Tus actividades que resultaron en un pedido."}
          </p>
        </div>
      </div>

      <ActivityViewTabs />

      <ConversionClient
        isAdmin={isAdmin}
        reps={reps}
        initialDias={dias}
        initialRep={repFilter}
      />
    </div>
  );
}
