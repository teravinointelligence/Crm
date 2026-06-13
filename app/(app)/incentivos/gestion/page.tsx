import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRep } from "@/lib/auth";
import { GestionIncentivos } from "@/components/incentivos/GestionIncentivos";
import type { IncentiveProgram } from "@/lib/incentivos";

export const metadata = { title: "Gestión de Incentivos — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function GestionIncentivosPage() {
  const rep = await requireRep();
  if (rep.role !== "admin") redirect("/incentivos");

  const supabase = createClient();
  const { data: program } = await supabase
    .from("incentive_programs")
    .select("*")
    .eq("active", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle<IncentiveProgram>();

  if (!program) redirect("/incentivos");

  const [{ data: rules }, { data: unmapped }, { data: exclusions }] = await Promise.all([
    supabase
      .from("incentive_product_rules")
      .select("*")
      .eq("program_id", program.id)
      .order("category")
      .order("priority", { ascending: false }),
    supabase.rpc("get_incentive_unmapped", { p_program_id: program.id }),
    supabase
      .from("incentive_exclusions")
      .select("*, accounts(business_name, client_number)")
      .eq("program_id", program.id),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/incentivos"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Programa de Incentivos
        </Link>
        <h1 className="font-display text-3xl">Gestión · {program.name}</h1>
        <p className="text-sm text-muted-foreground">
          Mapeo de productos, exclusiones de clientes y configuración del cálculo.
        </p>
      </div>
      <GestionIncentivos
        program={program}
        rules={rules ?? []}
        unmapped={unmapped ?? []}
        exclusions={exclusions ?? []}
      />
    </div>
  );
}
