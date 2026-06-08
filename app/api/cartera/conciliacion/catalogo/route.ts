// POST /api/cartera/conciliacion/catalogo
// Recibe el Excel del catálogo de clientes y devuelve un PREVIEW: cada fila
// casada con su cuenta del CRM (RFC > # cliente > nombre) + sus llaves de
// pagador (firma/BNET/RFC). NO guarda nada. El commit es aparte.
//
// Auth: admin o contador.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { parseCatalog, matchRow, type AccountLite } from "@/lib/bank/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSeeFinance(rep.role)) {
    return NextResponse.json({ error: "Solo admin o contador" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseCatalog(await file.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No pudimos leer el Excel" },
      { status: 500 },
    );
  }
  if (!rows.length) {
    return NextResponse.json(
      { error: "No se encontraron clientes en la hoja 'Catálogo Clientes'." },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, business_name, fiscal_name, rfc, client_number")
    .range(0, 49999);

  const accs = (accounts ?? []) as AccountLite[];
  const matches = rows.map((r) => matchRow(r, accs));
  return NextResponse.json({ rows: matches });
}
