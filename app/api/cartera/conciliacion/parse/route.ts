// POST /api/cartera/conciliacion/parse
// Recibe el archivo del banco (multipart) y devuelve un PREVIEW de los movimientos.
// NO guarda nada. CSV/XLSX se parsean localmente; el PDF lo lee Claude (server).
//
// Auth: admin o contador (can_reconcile). La key de Anthropic vive solo en el server.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { detectFileKind, parseBankTable } from "@/lib/bank/parse";
import { extractBankTransactionsFromPdf } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo admin o contador pueden conciliar" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const kind = detectFileKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      { error: "Formato no soportado. Sube PDF, CSV o XLSX." },
      { status: 400 },
    );
  }

  try {
    if (kind === "pdf") {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const rows = await extractBankTransactionsFromPdf(base64);
      return NextResponse.json({
        source: "pdf",
        fileKind: kind,
        fileName: file.name,
        rows,
        errors: rows.length ? [] : [{ row: 0, message: "Claude no devolvió movimientos del PDF." }],
      });
    }
    const buf = await file.arrayBuffer();
    const result = parseBankTable(buf);
    return NextResponse.json({
      source: "table",
      fileKind: kind,
      fileName: file.name,
      rows: result.rows,
      errors: result.errors,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al parsear el archivo" },
      { status: 500 },
    );
  }
}
