import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SampleBankClient, type BankRow } from "@/components/samples/SampleBankClient";

export const metadata = { title: "Banco de muestras — TERAVINO CRM" };

export default async function BancoMuestrasPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const isAdmin = rep.role === "admin";

  // RLS: el vendedor solo ve su zona; admin/contador ven todas.
  const { data } = await supabase
    .from("v_sample_bank")
    .select("product_id, product_name, supplier, region, available, ingresado, tomado")
    .gt("available", 0)
    .order("region")
    .order("product_name");

  const rows: BankRow[] = (data ?? []).map((r) => ({
    product_id: r.product_id as string,
    product_name: (r.product_name as string) ?? "",
    supplier: (r.supplier as string | null) ?? null,
    region: (r.region as string | null) ?? null,
    available: Number(r.available ?? 0),
    ingresado: Number(r.ingresado ?? 0),
    tomado: Number(r.tomado ?? 0),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>
      <div>
        <h1 className="font-display text-3xl">Banco de muestras</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Botellas de muestra disponibles por zona. Entran al banco cuando autorizas una solicitud."
            : `Muestras disponibles en tu zona${rep.primary_region ? ` (${rep.primary_region})` : ""}. Toma una para tus citas.`}
        </p>
      </div>
      <SampleBankClient rows={rows} isAdmin={isAdmin} />
    </div>
  );
}
