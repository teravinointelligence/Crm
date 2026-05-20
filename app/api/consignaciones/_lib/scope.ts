// Auth + scope helper para las rutas /api/consignaciones/*.
//
// - Verifica que haya rep logueado en el CRM.
// - Para no-admin: carga la consignación de Base44 y valida que su
//   `vendedor_id` corresponda al Vendedor del rep (match por email).
// - Devuelve la consignación cargada (evita re-fetch en el handler).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import {
  base44,
  resolveBase44Vendedor,
  type Base44Consignacion,
} from "@/lib/base44";

export type ScopeResult =
  | { ok: true; isAdmin: boolean; consignacion: Base44Consignacion; repFullName: string; repEmail: string }
  | { ok: false; response: NextResponse };

export async function loadConsignacionForRep(consignacionId: string): Promise<ScopeResult> {
  const rep = await getCurrentRep();
  if (!rep) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const isAdmin = rep.role === "admin";

  let consignacion: Base44Consignacion;
  try {
    consignacion = await base44.entity<Base44Consignacion>("Consignacion").get(consignacionId);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Consignación no encontrada" }, { status: 404 }) };
  }

  if (!isAdmin) {
    const vendedor = await resolveBase44Vendedor(rep.email);
    if (!vendedor || vendedor.id !== consignacion.vendedor_id) {
      // 404 (no 403) — no revelamos la existencia del registro a un rep que no lo posee.
      return { ok: false, response: NextResponse.json({ error: "Consignación no encontrada" }, { status: 404 }) };
    }
  }

  return { ok: true, isAdmin, consignacion, repFullName: rep.full_name, repEmail: rep.email };
}

/** Suma la cantidad total de unidades de los items (para validar topes de venta/devolución). */
export function totalItemsCantidad(c: Base44Consignacion): number {
  return (c.items ?? []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
}

/** Append a una nota con timestamp. Útil para llevar bitácora dentro del campo `notas`. */
export function appendNota(prev: string | undefined, line: string, author: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const entry = `${stamp} · ${author}: ${line}`;
  return prev ? `${prev}\n${entry}` : entry;
}
