// POST /api/dashboard/sugerencias
// Lista de actividades sugeridas para el vendedor autenticado. El código detecta
// los pendientes de SU cartera (RLS) y el LLM elige/prioriza/redacta las mejores.
// No ejecuta nada: el vendedor lee y decide. Devuelve [] si no hay pendientes.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { loadActivityCandidates, suggestionHref } from "@/lib/suggested-activities";
import { generateSuggestedActivities } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const supabase = createClient();
  const candidatos = await loadActivityCandidates(supabase, rep.id);
  if (!candidatos.length) return NextResponse.json({ sugerencias: [] });

  const byId = new Map(candidatos.map((c) => [c.account_id, c]));

  try {
    const picked = await generateSuggestedActivities({
      vendedor: rep.full_name.split(" ")[0],
      candidatos: candidatos.map((c) => ({
        id: c.account_id,
        cuenta: c.business_name,
        region: c.region,
        tipo: c.kind,
        detalle: c.detalle,
      })),
      max: 6,
    });

    const sugerencias = picked
      .map((p) => {
        const c = byId.get(p.id);
        if (!c) return null;
        return {
          account_id: c.account_id,
          business_name: c.business_name,
          region: c.region,
          kind: c.kind,
          titulo: p.titulo,
          motivo: p.motivo,
          href: suggestionHref(c.kind, c.account_id),
        };
      })
      .filter(Boolean);

    return NextResponse.json({ sugerencias });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al generar sugerencias.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
