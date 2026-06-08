import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText, BookUser, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { UploadStatement } from "@/components/cartera/conciliacion/UploadStatement";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Conciliación bancaria — TERAVINO CRM" };

type StatementRow = {
  id: string;
  bank: string | null;
  account_label: string | null;
  period_start: string | null;
  period_end: string | null;
  file_name: string | null;
  created_at: string | null;
};

export default async function ConciliacionPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canSeeFinance(rep.role)) redirect("/cartera");

  const supabase = createClient();
  const { data: statements } = await supabase
    .from("bank_statements")
    .select("id, bank, account_label, period_start, period_end, file_name, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (statements ?? []) as StatementRow[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cartera">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cartera
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Conciliación bancaria</h1>
          <p className="text-sm text-muted-foreground">
            Sube el estado de cuenta del banco, concilia los abonos contra facturas y
            confirma los pagos. Nada se aplica sin tu confirmación.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rep.role === "admin" && (
            <Button asChild variant="outline">
              <Link href="/cartera/bodegas">
                <Warehouse className="mr-1 h-4 w-4" /> Rentas de bodega
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/cartera/conciliacion/catalogo">
              <BookUser className="mr-1 h-4 w-4" /> Catálogo de pagadores
            </Link>
          </Button>
        </div>
      </div>

      <UploadStatement />

      <div className="space-y-3">
        <h2 className="font-display text-lg">Estados de cuenta cargados</h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aún no hay estados de cuenta"
            description="Sube tu primer archivo del banco arriba para empezar a conciliar."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Banco</th>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3">Periodo</th>
                    <th className="px-4 py-3">Archivo</th>
                    <th className="px-4 py-3">Cargado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{s.bank ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.account_label ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.period_start || s.period_end
                          ? `${s.period_start ? formatDate(s.period_start) : "?"} – ${s.period_end ? formatDate(s.period_end) : "?"}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.file_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(s.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/cartera/conciliacion/${s.id}`}>Conciliar</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
