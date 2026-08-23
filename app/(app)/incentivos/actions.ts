"use server";

import { revalidatePath } from "next/cache";
import { requireRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { roundSalesTarget } from "@/lib/sales-targets";

export async function overrideSalesTarget(formData: FormData): Promise<void> {
  const rep = await requireRep();
  if (rep.role !== "admin") throw new Error("No autorizado");

  const targetId = String(formData.get("targetId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const requestedAmount = Number(formData.get("targetAmount"));
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) throw new Error("Meta inválida");
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new Error("Captura una meta válida");
  }
  if (reason.length < 5) throw new Error("Explica brevemente el motivo del ajuste");

  const supabase = createClient();
  const { error } = await supabase
    .from("seller_monthly_targets")
    .update({
      target_amount: roundSalesTarget(requestedAmount),
      selected_basis: "direction_override",
      status: "overridden",
      override_reason: reason,
      overridden_by: rep.id,
      locked_at: new Date().toISOString(),
    })
    .eq("id", targetId);
  if (error) throw new Error(`No se pudo actualizar la meta: ${error.message}`);

  revalidatePath("/incentivos");
}
