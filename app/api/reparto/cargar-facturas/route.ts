import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canManageReparto } from "@/lib/modules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPARTO_SYNC_WEBHOOK =
  "https://hook.us2.make.com/3je3rftr2r4o6wyucp9mfed5q8fghp6t";

export async function POST() {
  const rep = await getCurrentRep();

  if (!rep) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  if (!canManageReparto(rep.role)) {
    return NextResponse.json(
      { ok: false, error: "Sin permisos para cargar facturas." },
      { status: 403 },
    );
  }

  try {
    const startedAt = new Date().toISOString();
    const response = await fetch(REPARTO_SYNC_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "crm-reparto",
        requested_at: startedAt,
        requested_by: rep.email ?? rep.id,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "El sincronizador de facturas no respondió correctamente." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Sincronización de facturas iniciada.",
      started_at: startedAt,
    });
  } catch (error) {
    console.error("Error al iniciar sincronización de facturas de Reparto", error);
    return NextResponse.json(
      { ok: false, error: "No fue posible iniciar la carga de facturas." },
      { status: 502 },
    );
  }
}
