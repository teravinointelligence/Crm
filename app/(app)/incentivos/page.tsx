import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { VendorIncentives } from "@/components/incentivos/VendorIncentives";
import { TeamIncentives } from "@/components/incentivos/TeamIncentives";
import type { IncentiveDetailRow, IncentiveLevel, IncentiveProgram } from "@/lib/incentivos";

export const metadata = { title: "Incentivos — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function IncentivosPage({
  searchParams,
}: {
  searchParams: { rep?: string };
}) {
  const rep = await requireRep();
  const supabase = createClient();
  const seesAll = canSeeFinance(rep.role); // admin y contador

  const { data: program } = await supabase
    .from("incentive_programs")
    .select("*")
    .eq("active", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle<IncentiveProgram>();

  if (!program) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-3xl">Incentivos</h1>
        <p className="text-sm text-muted-foreground">No hay ningún programa de incentivos activo.</p>
      </div>
    );
  }

  const [{ data: levels }, { data: detail }, { data: participants }] = await Promise.all([
    supabase
      .from("incentive_levels")
      .select("*")
      .eq("program_id", program.id)
      .order("sort_order"),
    // Trae TODO el detalle facturado (cobrado va como flag por renglón): la
    // función aplica la autorización (el vendedor solo recibe lo suyo).
    supabase.rpc("get_incentive_detail", { p_program_id: program.id, p_require_paid: false }),
    supabase
      .from("incentive_participants")
      .select("rep_id, sales_reps(id, full_name)")
      .eq("program_id", program.id),
  ]);

  const rows = (detail ?? []) as IncentiveDetailRow[];
  const lvls = (levels ?? []) as IncentiveLevel[];
  const participantIds = new Set((participants ?? []).map((p) => p.rep_id));

  // Admin/contador: dashboard del equipo, o el detalle de un vendedor (?rep=).
  if (seesAll) {
    const repId = searchParams.rep;
    if (repId) {
      const part = (participants ?? []).find((p) => p.rep_id === repId);
      const name =
        (part?.sales_reps as unknown as { full_name: string } | null)?.full_name ?? "Vendedor";
      return (
        <div className="space-y-4">
          <div>
            <Link
              href="/incentivos"
              className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Equipo
            </Link>
            <h1 className="font-display text-3xl">Incentivos · {name}</h1>
            <p className="text-sm text-muted-foreground">{program.name}</p>
          </div>
          <VendorIncentives
            program={program}
            levels={lvls}
            rows={rows.filter((r) => r.rep_id === repId)}
            repId={repId}
            repName={name}
            isSelf={false}
            seenPoints={null}
          />
        </div>
      );
    }
    const participantNames: Record<string, string> = {};
    for (const p of participants ?? []) {
      const sr = p.sales_reps as unknown as { id: string; full_name: string } | null;
      if (sr) participantNames[p.rep_id] = sr.full_name;
    }
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl">Programa de Incentivos · Equipo</h1>
          <p className="text-sm text-muted-foreground">
            {program.name} · vigencia {program.start_date} a {program.end_date} · financiado por{" "}
            {program.provider}
          </p>
        </div>
        <TeamIncentives program={program} levels={lvls} rows={rows} participantNames={participantNames} />
      </div>
    );
  }

  // Vendedor: su propia página.
  if (!participantIds.has(rep.id)) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-3xl">Incentivos</h1>
        <p className="text-sm text-muted-foreground">
          No participas en el programa activo ({program.name}). Pregunta a dirección si crees que es un error.
        </p>
      </div>
    );
  }

  const { data: seen } = await supabase
    .from("incentive_points_seen")
    .select("points_seen")
    .eq("program_id", program.id)
    .eq("rep_id", rep.id)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl">Mis Incentivos</h1>
        <p className="text-sm text-muted-foreground">
          {program.name} · vigencia {program.start_date} a {program.end_date}
        </p>
      </div>
      <VendorIncentives
        program={program}
        levels={lvls}
        rows={rows.filter((r) => r.rep_id === rep.id)}
        repId={rep.id}
        repName={rep.full_name}
        isSelf
        seenPoints={Number(seen?.points_seen ?? 0)}
      />
    </div>
  );
}
