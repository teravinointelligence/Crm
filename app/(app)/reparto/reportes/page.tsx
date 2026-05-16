// Reportes de Reparto. Placeholder; se entrega en PR B.

import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Reportes — Reparto" };

export default async function ReportesRepartoPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Reportes de reparto</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <BarChart3 className="h-8 w-8 text-brand-carmesi" />
          <h3 className="font-display text-lg">Próximamente</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            KPIs, gráfica diaria y ranking por chofer se entregan en el PR B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
