// Nuevo pedido manual. La carga masiva por XML/CFDI se entrega en PR B.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PedidoForm } from "@/components/reparto/PedidoForm";

export const metadata = { title: "Nuevo pedido — Reparto" };

export default async function NuevoPedidoPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/reparto/pedidos"><ArrowLeft className="mr-1 h-4 w-4" /> Pedidos</Link>
      </Button>
      <h1 className="font-display text-3xl">Nuevo pedido</h1>
      <PedidoForm />
    </div>
  );
}
