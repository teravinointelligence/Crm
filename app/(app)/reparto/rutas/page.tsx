// Kanban drag&drop de rutas. Placeholder; se entrega en PR C.

import { redirect } from "next/navigation";
import { Route } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Rutas — Reparto" };

export default async function RutasPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Rutas del día</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <Route className="h-8 w-8 text-brand-carmesi" />
          <h3 className="font-display text-lg">Kanban próximamente</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            La asignación drag-and-drop de pedidos a choferes se entrega en el PR C.
            Mientras tanto puedes asignar el chofer desde el detalle de cada pedido.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
