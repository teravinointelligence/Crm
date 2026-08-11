// PDF del reporte de muestras por vendedor. Recibe el mismo rango y los mismos
// filtros que la pantalla (/muestras/reporte) y arma el documento con
// lib/muestras-reporte.ts, así que el PDF es un espejo de lo que se ve.
//
// El alcance lo sigue poniendo RLS: el vendedor solo obtiene sus solicitudes.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SampleReportPdf } from "@/components/samples/SampleReportPdf";
import {
  agrupaPorVendedor,
  etiquetaEstatus,
  filtraReporte,
  loadSampleReport,
  normalizaRango,
  SIN_BORRADOR,
  TODOS,
  totalesDe,
} from "@/lib/muestras-reporte";
import { dateKeyTz } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const { desde, hasta } = normalizaRango(
    searchParams.get("desde") ?? undefined,
    searchParams.get("hasta") ?? undefined,
    dateKeyTz(new Date()),
  );
  const filtros = {
    rep: searchParams.get("rep") || TODOS,
    estatus: searchParams.get("estatus") || SIN_BORRADOR,
  };

  const supabase = createClient();
  const rows = filtraReporte(await loadSampleReport(supabase, desde, hasta), filtros);
  const porVendedor = agrupaPorVendedor(rows);

  const pdf = await renderToBuffer(
    SampleReportPdf({
      data: {
        desde,
        hasta,
        generadoISO: new Date().toISOString(),
        filtroVendedor:
          filtros.rep === TODOS
            ? "Todos"
            : porVendedor.find((r) => r.repId === filtros.rep)?.vendedor ??
              rows.find((r) => r.repId === filtros.rep)?.vendedor ??
              "Sin solicitudes",
        filtroEstatus: etiquetaEstatus(filtros.estatus),
        porVendedor,
        totales: totalesDe(porVendedor),
        detalle: rows,
      },
    }),
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="muestras-por-vendedor_${desde}_a_${hasta}.pdf"`,
    },
  });
}
