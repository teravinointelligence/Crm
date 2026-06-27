import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  loadReassignmentStatus,
  REASSIGN_WARN_DAYS,
  REASSIGN_GRACE_DAYS,
} from "@/lib/reasignacion-inactivas";
import { ReasignacionBoard } from "@/components/accounts/ReasignacionBoard";

export const metadata = { title: "Reasignación por inactividad — TERAVINO CRM" };

export default async function ReasignacionPage() {
  if (!(await isAdmin())) redirect("/cuentas");
  const supabase = createClient();
  const { atRisk, recent } = await loadReassignmentStatus(supabase);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cuentas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cuentas
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="font-display text-3xl">Reasignación por inactividad</h1>
        <p className="text-sm text-muted-foreground">
          Las cuentas asignadas sin actividad en {REASSIGN_WARN_DAYS} días reciben un aviso al
          vendedor ("te quedan {REASSIGN_GRACE_DAYS} días"). Si sigue sin actividad, la cuenta
          regresa al pool de <Link href="/cuentas/asignar-vendedor" className="underline">Asignar
          vendedor</Link>. Corre automático a diario; aquí puedes ver el estado y ejecutarlo a mano.
        </p>
      </div>

      <ReasignacionBoard atRisk={atRisk} recent={recent} />
    </div>
  );
}
