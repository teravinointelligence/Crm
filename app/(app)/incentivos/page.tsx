import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { VendorIncentives } from "@/components/incentivos/VendorIncentives";
import { TeamIncentives } from "@/components/incentivos/TeamIncentives";
import { BogleVendor } from "@/components/incentivos/BogleVendor";
import { BogleAdmin } from "@/components/incentivos/BogleAdmin";
import type {
  IncentiveDetailRow,
  IncentiveLevel,
  IncentivePlacement,
  IncentiveProgram,
  IncentiveRaceRow,
} from "@/lib/incentivos";

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

  // Pueden convivir varios programas activos con mecánicas distintas:
  // 'puntos' (Gerard Bertrand, niveles) y 'encartes' (Bogle, carrera).
  const { data: programsData } = await supabase
    .from("incentive_programs")
    .select("*")
    .eq("active", true)
    .order("start_date", { ascending: false });
  const programs = (programsData ?? []) as IncentiveProgram[];
  const puntosProg = programs.find((p) => p.tipo === "puntos") ?? null;
  const encartesProg = programs.find((p) => p.tipo === "encartes") ?? null;

  if (!puntosProg && !encartesProg) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-3xl">Incentivos</h1>
        <p className="text-sm text-muted-foreground">No hay ningún programa de incentivos activo.</p>
      </div>
    );
  }

  // --- Datos del programa de PUNTOS (GB) ---
  const [{ data: levels }, { data: detail }, { data: participants }] = puntosProg
    ? await Promise.all([
        supabase.from("incentive_levels").select("*").eq("program_id", puntosProg.id).order("sort_order"),
        supabase.rpc("get_incentive_detail", { p_program_id: puntosProg.id, p_require_paid: false }),
        supabase.from("incentive_participants").select("rep_id, sales_reps(id, full_name)").eq("program_id", puntosProg.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const rows = (detail ?? []) as IncentiveDetailRow[];
  const lvls = (levels ?? []) as IncentiveLevel[];
  const gbParticipantIds = new Set((participants ?? []).map((p) => p.rep_id));

  // --- Datos del programa de ENCARTES (Bogle) ---
  // placements viene acotado por RLS: el vendedor solo recibe los suyos.
  const [{ data: placementsData }, { data: raceData }] = encartesProg
    ? await Promise.all([
        supabase
          .from("incentive_placements")
          .select("*")
          .eq("program_id", encartesProg.id)
          .order("fecha_deteccion"),
        supabase.rpc("get_incentive_race", { p_program_id: encartesProg.id }),
      ])
    : [{ data: [] }, { data: [] }];
  const placements = (placementsData ?? []) as IncentivePlacement[];
  const race = (raceData ?? []) as IncentiveRaceRow[];
  const bogleParticipantIds = new Set(race.map((r) => r.rep_id));

  // --- Admin/contador ---
  if (seesAll) {
    const repId = searchParams.rep;
    if (repId) {
      const part = (participants ?? []).find((p) => p.rep_id === repId);
      const name =
        (part?.sales_reps as unknown as { full_name: string } | null)?.full_name ??
        race.find((r) => r.rep_id === repId)?.rep_name ??
        "Vendedor";
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
          </div>
          {encartesProg && bogleParticipantIds.has(repId) && (
            <BogleVendor
              program={encartesProg}
              placements={placements.filter((p) => p.rep_id === repId)}
              race={race}
              repId={repId}
              isSelf={false}
            />
          )}
          {puntosProg && (
            <VendorIncentives
              program={puntosProg}
              levels={lvls}
              rows={rows.filter((r) => r.rep_id === repId)}
              repId={repId}
              repName={name}
              isSelf={false}
              seenPoints={null}
            />
          )}
        </div>
      );
    }

    const participantNames: Record<string, string> = {};
    for (const p of participants ?? []) {
      const sr = p.sales_reps as unknown as { id: string; full_name: string } | null;
      if (sr) participantNames[p.rep_id] = sr.full_name;
    }
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl">Programa de Incentivos · Equipo</h1>
          <p className="text-sm text-muted-foreground">
            {programs.map((p) => p.name).join(" · ")}
          </p>
        </div>
        {encartesProg && <BogleAdmin program={encartesProg} placements={placements} race={race} />}
        {puntosProg && (
          <TeamIncentives program={puntosProg} levels={lvls} rows={rows} participantNames={participantNames} />
        )}
      </div>
    );
  }

  // --- Vendedor ---
  const enGB = puntosProg && gbParticipantIds.has(rep.id);
  const enBogle = encartesProg && bogleParticipantIds.has(rep.id);
  if (!enGB && !enBogle) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-3xl">Incentivos</h1>
        <p className="text-sm text-muted-foreground">
          No participas en los programas activos. Pregunta a dirección si crees que es un error.
        </p>
      </div>
    );
  }

  const { data: seen } = enGB
    ? await supabase
        .from("incentive_points_seen")
        .select("points_seen")
        .eq("program_id", puntosProg.id)
        .eq("rep_id", rep.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Mis Incentivos</h1>
        <p className="text-sm text-muted-foreground">{programs.map((p) => p.name).join(" · ")}</p>
      </div>
      {enBogle && (
        <BogleVendor
          program={encartesProg}
          placements={placements}
          race={race}
          repId={rep.id}
          isSelf
        />
      )}
      {enGB && (
        <VendorIncentives
          program={puntosProg}
          levels={lvls}
          rows={rows.filter((r) => r.rep_id === rep.id)}
          repId={rep.id}
          repName={rep.full_name}
          isSelf
          seenPoints={Number(seen?.points_seen ?? 0)}
        />
      )}
    </div>
  );
}
