// GET /api/cuentas/export — descarga la info de empresas (cuentas) en Excel (.xlsx),
// con una pestaña por vendedor. Solo para admin.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import type { Account, SalesRep } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ]
function sheetName(name: string): string {
  return (name || "Sin nombre").replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim();
}

export async function GET() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (rep.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const supabase = createClient();
  const [{ data: accounts, error }, { data: reps }] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .in("status", ["activo", "prospecto"])
      .order("business_name", { ascending: true }),
    supabase.from("sales_reps").select("id, full_name").order("full_name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const repName = new Map((reps ?? []).map((r: Pick<SalesRep, "id" | "full_name">) => [r.id, r.full_name]));

  const toRow = (a: Account) => ({
    "# Cliente": a.client_number ?? "",
    Negocio: a.business_name ?? "",
    "Nombre fiscal": a.fiscal_name ?? "",
    RFC: a.rfc ?? "",
    Tipo: a.account_type ?? "",
    Región: a.region ?? "",
    Ciudad: a.city ?? "",
    Dirección: a.address ?? "",
    Tier: a.price_tier === "+10" ? "+10%" : "Base",
    "Días crédito": a.credit_days ?? "",
    Status: a.status ?? "",
    Vendedor: a.assigned_rep_id ? repName.get(a.assigned_rep_id) ?? "" : "",
    Notas: a.notes ?? "",
  });

  const cols = [
    { wch: 12 }, // # Cliente
    { wch: 32 }, // Negocio
    { wch: 32 }, // Nombre fiscal
    { wch: 16 }, // RFC
    { wch: 14 }, // Tipo
    { wch: 16 }, // Región
    { wch: 16 }, // Ciudad
    { wch: 36 }, // Dirección
    { wch: 8 }, // Tier
    { wch: 12 }, // Días crédito
    { wch: 12 }, // Status
    { wch: 22 }, // Vendedor
    { wch: 40 }, // Notas
  ];

  // Agrupa cuentas por vendedor (las sin asignar van a su propio grupo).
  const groups = new Map<string, Account[]>();
  for (const a of (accounts ?? []) as Account[]) {
    const key = a.assigned_rep_id ?? "_none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const addSheet = (label: string, rows: Account[]) => {
    let name = sheetName(label);
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = sheetName(`${label} ${n++}`);
    }
    usedNames.add(name.toLowerCase());
    const sheet = XLSX.utils.json_to_sheet(rows.map(toRow));
    sheet["!cols"] = cols;
    XLSX.utils.book_append_sheet(wb, sheet, name);
  };

  // Hoja "Todas" primero, luego una por vendedor (orden alfabético), y "Sin vendedor" al final.
  addSheet("Todas", (accounts ?? []) as Account[]);

  const sortedReps = (reps ?? [])
    .filter((r) => groups.has(r.id))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  for (const r of sortedReps) {
    addSheet(r.full_name ?? "Vendedor", groups.get(r.id)!);
  }
  if (groups.has("_none")) {
    addSheet("Sin vendedor", groups.get("_none")!);
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="empresas-por-vendedor-${today}.xlsx"`,
    },
  });
}
