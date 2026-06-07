import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { ReconcileBoard, type BoardTxn } from "@/components/cartera/conciliacion/ReconcileBoard";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Conciliar estado de cuenta — TERAVINO CRM" };

export default async function StatementDetailPage({
  params,
}: {
  params: { statementId: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canSeeFinance(rep.role)) redirect("/cartera");

  const supabase = createClient();
  const { data: statement } = await supabase
    .from("bank_statements")
    .select("id, bank, account_label, account_number, period_start, period_end, file_name")
    .eq("id", params.statementId)
    .single();
  if (!statement) notFound();

  const { data: txns } = await supabase
    .from("bank_transactions")
    .select("id, txn_date, description, reference, amount, kind, estado_conciliacion, suggestion")
    .eq("bank_statement_id", params.statementId)
    .order("kind")
    .order("row_index");

  const board = ((txns ?? []) as unknown[]).map((t) => {
    const r = t as Record<string, unknown>;
    return {
      id: r.id as string,
      txn_date: (r.txn_date as string | null) ?? null,
      description: (r.description as string) ?? "",
      reference: (r.reference as string | null) ?? null,
      amount: Number(r.amount ?? 0),
      kind: r.kind as "abono" | "cargo",
      estado_conciliacion: r.estado_conciliacion as BoardTxn["estado_conciliacion"],
      suggestion: (r.suggestion as BoardTxn["suggestion"]) ?? null,
    } satisfies BoardTxn;
  });

  const periodo =
    statement.period_start || statement.period_end
      ? `${statement.period_start ? formatDate(statement.period_start) : "?"} – ${statement.period_end ? formatDate(statement.period_end) : "?"}`
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cartera/conciliacion">
            <ArrowLeft className="mr-1 h-4 w-4" /> Conciliación
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="font-display text-3xl">
          {statement.bank ?? "Estado de cuenta"}
          {statement.account_label ? ` · ${statement.account_label}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[statement.account_number, periodo, statement.file_name].filter(Boolean).join(" · ") || "Movimientos del estado de cuenta"}
        </p>
      </div>

      <ReconcileBoard statementId={statement.id} txns={board} />
    </div>
  );
}
