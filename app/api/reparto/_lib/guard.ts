// Helpers compartidos para las API routes /api/reparto/*.
// Validan que el usuario del CRM esté logueado con el rol adecuado antes de
// exponer/escribir datos de Reparto (que usan service_role server-side).
//
//   requireReparto       → VER: admin, jefe_logistica, chofer, vendedor (read-only).
//   requireRepartoManage → GESTIONAR: admin, jefe_logistica (altas/edición).
//   requireAdmin         → solo admin (diagnóstico/operaciones sensibles).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canViewReparto, canManageReparto } from "@/lib/modules";

async function gate(predicate: (role: string | null | undefined) => boolean, forbiddenMsg: string) {
  const rep = await getCurrentRep();
  if (!rep) {
    return { rep: null, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (!predicate(rep.role)) {
    return { rep, response: NextResponse.json({ error: forbiddenMsg }, { status: 403 }) };
  }
  return { rep, response: null };
}

export function requireAdmin() {
  return gate((role) => role === "admin", "Solo admin");
}

export function requireReparto() {
  return gate(canViewReparto, "Sin acceso a Reparto");
}

export function requireRepartoManage() {
  return gate(canManageReparto, "Requiere rol admin o jefe de logística");
}
