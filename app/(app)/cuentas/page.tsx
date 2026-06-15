import Link from "next/link";
import { Link2, Download, MailWarning, Upload, AlarmClock, PackageX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { AccountsListClient } from "@/components/accounts/AccountsListClient";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Cuentas — TERAVINO CRM" };

export default async function CuentasPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const [accountsRes, repsRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("*, sales_reps:assigned_rep_id(full_name)")
      .order("business_name", { ascending: true }),
    supabase
      .from("sales_reps")
      .select("*")
      .eq("active", true)
      .order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Cuentas</h1>
          <p className="text-sm text-muted-foreground">
            Hoteles, restaurantes, bares y otros clientes HORECA.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/cuentas/export">
                <Download className="mr-1 h-4 w-4" /> Descargar Excel por vendedor
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/cuentas/importar">
                <Upload className="mr-1 h-4 w-4" /> Cargar datos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/cuentas/sincronizar-clientes">
                <Link2 className="mr-1 h-4 w-4" /> Sincronizar # cliente
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/cuentas/datos-faltantes">
                <MailWarning className="mr-1 h-4 w-4" /> Datos faltantes
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/cuentas/clientes-inactivos">
                <AlarmClock className="mr-1 h-4 w-4" /> Clientes inactivos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/cuentas/sin-pedidos">
                <PackageX className="mr-1 h-4 w-4" /> Dejaron de pedir
              </Link>
            </Button>
          </div>
        )}
      </div>
      <AccountsListClient
        accounts={(accountsRes.data ?? []) as never}
        reps={repsRes.data ?? []}
        isAdmin={!!isAdmin}
      />
    </div>
  );
}
