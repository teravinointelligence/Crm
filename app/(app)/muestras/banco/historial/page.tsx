// Historial de tomas del banco de muestras: todas las muestras usadas, con
// quién, para qué cliente y cuándo. Filtrable. RLS: vendedor ve su zona; admin todo.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SampleHistoryClient, type TomaRow } from "@/components/samples/SampleHistoryClient";

export const metadata = { title: "Historial de muestras — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function HistorialMuestrasPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const isAdmin = rep.role === "admin";
  const supabase = createClient();
  const [{ data }, { data: devData }] = await Promise.all([
    supabase
      .from("sample_bank_movements")
      .select("id, created_at, region, quantity, notes, product:product_id(name), rep:taken_by(full_name), account:account_id(business_name)")
      .eq("kind", "toma")
      .order("created_at", { ascending: false })
      .limit(1000),
    // Tomas ya devueltas: las devoluciones apuntan a la toma via reverts_id.
    supabase
      .from("sample_bank_movements")
      .select("reverts_id, quantity")
      .eq("kind", "devolucion"),
  ]);

  // Suma devuelta por toma; se considera "devuelta" si cubre la cantidad tomada.
  const revertedQty = new Map<string, number>();
  for (const d of (devData ?? []) as { reverts_id: string | null; quantity: number | string }[]) {
    if (!d.reverts_id) continue;
    revertedQty.set(d.reverts_id, (revertedQty.get(d.reverts_id) ?? 0) + Number(d.quantity ?? 0));
  }

  const rows: TomaRow[] = (data ?? []).map((r: any) => {
    const qty = Math.abs(Number(r.quantity ?? 0));
    return {
      id: r.id,
      created_at: r.created_at,
      region: r.region ?? null,
      qty,
      notes: r.notes ?? null,
      product_name: r.product?.name ?? "—",
      rep_name: r.rep?.full_name ?? null,
      account_name: r.account?.business_name ?? null,
      reverted: (revertedQty.get(r.id) ?? 0) >= qty,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Historial de muestras</h1>
          <p className="text-sm text-muted-foreground">
            Todas las muestras tomadas del banco: quién, para qué cliente y cuándo.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/muestras/banco"><ArrowLeft className="mr-1 h-4 w-4" /> Banco de muestras</Link>
        </Button>
      </div>
      <SampleHistoryClient rows={rows} isAdmin={isAdmin} />
    </div>
  );
}
