// Dashboard de Reparto (KPIs + monitor de choferes). Placeholder; se completa en PR B.

import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Truck, ClipboardList } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard Reparto" };

export default async function DashboardRepartoPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Dashboard de reparto</h1>
        <p className="text-sm text-muted-foreground">KPIs del día y monitor de choferes.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <LayoutDashboard className="h-8 w-8 text-brand-carmesi" />
          <h3 className="font-display text-lg">Próximamente</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            El dashboard con KPIs en tiempo real y el monitor de choferes se entrega en el PR B.
            Por ahora puedes operar desde Pedidos y Bitácora.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm"><Link href="/reparto/pedidos"><ClipboardList className="mr-1 h-4 w-4" /> Pedidos</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/reparto/bitacora"><Truck className="mr-1 h-4 w-4" /> Bitácora</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
