// Helper compartido para las API routes /api/reparto/*.
// Valida que el usuario del CRM esté logueado como admin antes de exponer
// datos del proyecto Reparto (que usa service_role server-side).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";

export async function requireAdmin() {
  const rep = await getCurrentRep();
  if (!rep) {
    return { rep: null, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (rep.role !== "admin") {
    return { rep, response: NextResponse.json({ error: "Solo admin" }, { status: 403 }) };
  }
  return { rep, response: null };
}
