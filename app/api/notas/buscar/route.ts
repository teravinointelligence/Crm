// GET /api/notas/buscar?q=marr — busca cuentas y contactos para etiquetar (@).
// Usa el cliente con sesión, así que la RLS ya acota el universo al vendedor:
// nadie puede etiquetar una cuenta que no lleva.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";

export const dynamic = "force-dynamic";

const LIMIT = 6; // por tipo; el desplegable tiene que caber en un celular

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ cuentas: [], contactos: [] });

  // Escapamos los comodines de PostgREST para que "100%" no busque cualquier cosa.
  const pattern = `%${q.replace(/[%_,()]/g, " ")}%`;

  const supabase = createClient();
  const [cuentasRes, contactosRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, business_name")
      .ilike("business_name", pattern)
      .order("business_name")
      .limit(LIMIT),
    supabase
      .from("contacts")
      .select("id, full_name, account_id, accounts:account_id(business_name)")
      .ilike("full_name", pattern)
      .order("full_name")
      .limit(LIMIT),
  ]);

  const cuentas = ((cuentasRes.data ?? []) as { id: string; business_name: string | null }[]).map(
    (a) => ({ kind: "cuenta" as const, id: a.id, name: a.business_name ?? "(sin nombre)" }),
  );

  const contactos = (
    (contactosRes.data ?? []) as unknown as {
      id: string;
      full_name: string;
      account_id: string;
      accounts: { business_name: string | null } | null;
    }[]
  ).map((c) => ({
    kind: "contacto" as const,
    id: c.id,
    name: c.full_name,
    accountId: c.account_id,
    accountName: c.accounts?.business_name ?? null,
  }));

  return NextResponse.json({ cuentas, contactos });
}
