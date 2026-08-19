// Autorización compartida para registrar la entrega de un pedido de Reparto.
// La usan el endpoint que emite la URL firmada de subida y el que registra la
// entrega, para que ambos apliquen exactamente la misma regla.

import "server-only";
import { getCurrentRep } from "@/lib/auth";
import { canAccessReparto } from "@/lib/modules";
import { repartoAdmin } from "@/lib/supabase-reparto";

type Pedido = { id: string; estatus: string | null; chofer_id: string | null };

export type Autorizacion =
  | { ok: true; pedido: Pedido; usuarioId: string | null }
  | { ok: false; error: string; status: number };

export async function autorizarEntrega(pedidoId: string): Promise<Autorizacion> {
  const rep = await getCurrentRep();
  if (!rep) return { ok: false, error: "No autenticado", status: 401 };
  if (!canAccessReparto(rep.role)) {
    return { ok: false, error: "Sin acceso a Reparto", status: 403 };
  }

  const { data: pedido, error: pedErr } = await repartoAdmin
    .from("pedidos")
    .select("id, estatus, chofer_id")
    .eq("id", pedidoId)
    .single();
  if (pedErr || !pedido) return { ok: false, error: "Pedido no encontrado", status: 404 };

  // El chofer del CRM se enlaza con su usuario de Reparto por email.
  const { data: usuario } = await repartoAdmin
    .from("usuarios")
    .select("id")
    .ilike("email", rep.email)
    .maybeSingle();

  // Un chofer solo puede registrar la entrega de los pedidos asignados a él.
  // Logística/admin pueden registrar cualquiera.
  if (rep.role === "chofer" && (!usuario?.id || pedido.chofer_id !== usuario.id)) {
    return {
      ok: false,
      error: "Solo puedes registrar la entrega de tus pedidos asignados.",
      status: 403,
    };
  }

  return { ok: true, pedido: pedido as Pedido, usuarioId: usuario?.id ?? null };
}
