import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { buildCobranzaRanking, PROFILE_LABEL, type CobranzaInput } from "@/lib/cobranza-score";
import { RedactarCobranzaButton } from "@/components/cartera/RedactarCobranzaButton";
import type { AccountBalance } from "@/types/database";

export const metadata = { title: "Cobranza de hoy — TERAVINO CRM" };

const PROFILE_VARIANT = {
  buen_pagador: "success",
  irregular: "warning",
  moroso: "danger",
} as const;

export default async function CobranzaHoyPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canSeeFinance(rep.role)) redirect("/cartera");

  const supabase = createClient();

  // Cuentas con saldo vencido (la vista ya excluye socios y respeta crédito).
  const { data: balances } = await supabase
    .from("v_account_balance")
    .select("*")
    .gt("saldo_vencido", 0);

  const rowsRaw = ((balances ?? []) as AccountBalance[]).filter((b) => (b.saldo_vencido ?? 0) > 0);
  const ids = rowsRaw.map((b) => b.account_id);

  // Datos auxiliares para el score: # cliente, historial de pago y último contacto.
  const [{ data: accts }, { data: pays }, contactsRes] = await Promise.all([
    supabase.from("accounts").select("id, client_number").in("id", ids.length ? ids : ["-"]),
    supabase.from("payments").select("account_id, payment_date").in("account_id", ids.length ? ids : ["-"]),
    supabase
      .from("collection_contacts")
      .select("account_id, created_at")
      .in("account_id", ids.length ? ids : ["-"])
      .order("created_at", { ascending: false }),
  ]);

  const clientNum = new Map(
    ((accts ?? []) as { id: string; client_number: string | null }[]).map((a) => [a.id, a.client_number]),
  );

  // Historial de pagos: conteo y fecha del último, por cuenta.
  const payCount = new Map<string, number>();
  const lastPay = new Map<string, string>();
  for (const p of (pays ?? []) as { account_id: string; payment_date: string }[]) {
    payCount.set(p.account_id, (payCount.get(p.account_id) ?? 0) + 1);
    const prev = lastPay.get(p.account_id);
    if (!prev || p.payment_date > prev) lastPay.set(p.account_id, p.payment_date);
  }

  // Último contacto de cobranza (la tabla puede no existir aún → ignora error).
  const lastContact = new Map<string, string>();
  for (const c of (contactsRes.data ?? []) as { account_id: string; created_at: string }[]) {
    if (!lastContact.has(c.account_id)) lastContact.set(c.account_id, c.created_at);
  }

  const inputs: CobranzaInput[] = rowsRaw.map((b) => ({
    account_id: b.account_id,
    business_name: b.business_name ?? "(sin nombre)",
    client_number: clientNum.get(b.account_id) ?? null,
    assigned_rep_id: b.assigned_rep_id ?? null,
    saldo_vencido: b.saldo_vencido ?? 0,
    saldo_pendiente: b.saldo_pendiente ?? 0,
    dias_vencido: b.dias_vencido ?? 0,
    total_facturado: b.total_facturado ?? 0,
    total_pagado: b.total_pagado ?? 0,
    last_payment_date: lastPay.get(b.account_id) ?? null,
    payment_count: payCount.get(b.account_id) ?? 0,
    last_contact_at: lastContact.get(b.account_id) ?? null,
  }));

  const ranked = buildCobranzaRanking(inputs);
  const totalVencido = ranked.reduce((s, r) => s + r.saldo_vencido, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/cartera"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Cartera
        </Link>
        <h1 className="font-display text-3xl">Cobranza de hoy</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas con saldo vencido, ordenadas por prioridad (monto, días de atraso,
          historial de pago y contacto reciente). El orden y su porqué son transparentes.
        </p>
      </div>

      {!ranked.length ? (
        <EmptyState
          icon={ListChecks}
          title="Sin saldos vencidos"
          description="Ninguna cuenta tiene saldo vencido por cobrar hoy. ¡Buen trabajo!"
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Cuentas a cobrar</p>
                <p className="font-display text-2xl">{ranked.length}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencido total</p>
                <p className="font-display text-2xl text-red-700">{formatCurrency(totalVencido)}</p>
              </div>
            </CardContent>
          </Card>

          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Vencido</th>
                  <th className="px-3 py-2 text-right">Días</th>
                  <th className="px-3 py-2">Por qué este orden</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.account_id} className="border-b last:border-0 align-top">
                    <td className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-3">
                      <Link href={`/cartera/${r.account_id}`} className="font-medium hover:underline">
                        {r.business_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.client_number ? `#${r.client_number} · ` : ""}
                        <Badge variant={PROFILE_VARIANT[r.profile]} className="ml-0">
                          {PROFILE_LABEL[r.profile]}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-display text-lg">{r.score}</td>
                    <td className="px-3 py-3 text-right font-medium text-red-700">
                      {formatCurrency(r.saldo_vencido)}
                    </td>
                    <td className="px-3 py-3 text-right">{r.dias_vencido}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{r.why}</td>
                    <td className="px-3 py-3">
                      <RedactarCobranzaButton
                        accountId={r.account_id}
                        clientName={r.business_name}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
    </div>
  );
}
