import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SampleReviewActions } from "@/components/samples/SampleReviewActions";
import { AddCitasToSample } from "@/components/samples/AddCitasToSample";
import { formatDateTime } from "@/lib/utils";

export default async function SampleDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const isAdmin = rep.role === "admin";

  const { data: req } = await supabase
    .from("sample_requests")
    .select(
      "*, sales_reps:sales_rep_id(full_name), reviewer:reviewed_by(full_name), accounts:account_id(id, business_name), sample_request_items(id, product_id, product_name, supplier, quantity, notes), sample_request_activities(id, activities:activity_id(id, activity_date, activity_type, status, accounts:account_id(id, business_name, client_number)))",
    )
    .eq("id", params.id)
    .single();
  if (!req) notFound();

  const items = (req.sample_request_items ?? []) as Array<{
    id: string; product_id: string | null; product_name: string; supplier: string | null; quantity: number; notes: string | null;
  }>;
  const citas = ((req.sample_request_activities ?? []) as Array<{
    id: string;
    activities: {
      id: string; activity_date: string; activity_type: string; status: string;
      accounts: { id: string; business_name: string | null; client_number: string | null } | null;
    } | null;
  }>)
    .map((x) => x.activities)
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .sort((a, b) => a.activity_date.localeCompare(b.activity_date));
  const distinctAccountIds = Array.from(
    new Set(citas.map((c) => c.accounts?.id).filter((id): id is string => Boolean(id))),
  );
  const r = req as typeof req & {
    sales_reps: { full_name: string | null } | null;
    reviewer: { full_name: string | null } | null;
    accounts: { id: string; business_name: string | null } | null;
  };
  // Citas que el dueño (o un admin) puede sumar para registrar el uso de la muestra.
  const linkedIds = new Set(citas.map((c) => c.id));
  const canEdit = rep.id === r.sales_rep_id || isAdmin;
  let attachableCitas: Array<{ id: string; activity_date: string; activity_type: string; account_id: string | null; account_name: string | null; client_number: string | null }> = [];
  if (canEdit && r.status !== "rechazada" && distinctAccountIds.length < 3) {
    const { data: repCitasRaw } = await supabase
      .from("activities")
      .select("id, activity_date, activity_type, account_id, status, accounts:account_id(business_name, client_number)")
      .eq("sales_rep_id", r.sales_rep_id)
      .in("activity_type", ["visita", "degustacion", "reunion", "evento"])
      .neq("status", "cancelada")
      .order("activity_date", { ascending: false })
      .limit(60);
    attachableCitas = (repCitasRaw ?? [])
      .filter((c) => !linkedIds.has(c.id as string))
      .map((c) => {
        const acc = (Array.isArray(c.accounts) ? c.accounts[0] : c.accounts) as unknown as { business_name: string | null; client_number: string | null } | null;
        return {
          id: c.id as string,
          activity_date: c.activity_date as string,
          activity_type: c.activity_type as string,
          account_id: (c.account_id as string | null) ?? null,
          account_name: acc?.business_name ?? null,
          client_number: acc?.client_number ?? null,
        };
      });
  }
  const totalBottles = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const canExport = r.status === "aprobada" || r.status === "entregada";
  const mailSubject = `Solicitud de muestras ${r.request_number} — TERAVINO`;
  const mailBody = [
    `Solicitud de muestras ${r.request_number} (${r.status})`,
    `Solicitante: ${r.sales_reps?.full_name ?? "—"}`,
    r.accounts ? `Cliente: ${r.accounts.business_name}` : null,
    r.reason ? `Motivo: ${r.reason}` : null,
    r.training_people ? `Capacitación para ${r.training_people} persona(s)` : null,
    "",
    "Vinos:",
    ...items.map((i) => `• ${i.quantity} × ${i.product_name}${i.supplier ? ` (${i.supplier})` : ""}${i.notes ? ` — ${i.notes}` : ""}`),
    "",
    `Total de botellas: ${totalBottles}`,
    citas.length ? `\nCitas que cubre (${distinctAccountIds.length} cliente(s)):` : null,
    ...citas.map((c) => `• ${c.accounts?.business_name ?? "Sin cliente"} — ${formatDateTime(c.activity_date)} (${c.activity_type})`),
    r.notes ? `\nNotas: ${r.notes}` : null,
    r.review_notes ? `Revisión: ${r.review_notes}` : null,
    "",
    "(El PDF con el formato TERAVINO se puede descargar desde el CRM y adjuntar a este correo.)",
  ]
    .filter((l) => l !== null)
    .join("\n");
  const mailto = `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>

      <div className="rounded-lg border bg-card p-6 brand-shadow space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl">{r.request_number}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted">{r.status}</Badge>
            {r.training_people ? <Badge variant="accent">Capacitación · {r.training_people} personas</Badge> : null}
            {canExport && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/samples/${r.id}/pdf`} target="_blank" rel="noreferrer">
                    <FileDown className="mr-1 h-4 w-4" /> Descargar PDF
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={mailto}>
                    <Mail className="mr-1 h-4 w-4" /> Enviar por mail
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {r.sales_reps?.full_name ?? "—"} · {totalBottles} botella(s) · {formatDateTime(r.created_at)}
          {r.reason ? ` · ${r.reason}` : ""}
        </p>
        {r.accounts && (
          <Link href={`/cuentas/${r.accounts.id}`} className="text-sm text-brand-carmesi hover:underline">
            Para: {r.accounts.business_name}
          </Link>
        )}
        {r.notes && <p className="mt-3 border-t pt-3 text-sm">{r.notes}</p>}
        {r.review_notes && (
          <p className="mt-2 rounded-md bg-accent/15 p-3 text-sm">
            <strong>Revisión{r.reviewer?.full_name ? ` (${r.reviewer.full_name})` : ""}:</strong> {r.review_notes}
          </p>
        )}
      </div>

      <Card><CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Vino</th><th className="px-4 py-3">Bodega</th><th className="px-4 py-3 text-right">Botellas</th><th className="px-4 py-3">Nota</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-medium">{i.product_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.supplier ?? "—"}</td>
                <td className="px-4 py-3 text-right">{i.quantity}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {citas.length > 0 && (
        <Card><CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Citas que cubre esta muestra</h3>
            <Badge variant="muted">{distinctAccountIds.length} cliente(s)</Badge>
          </div>
          <ul className="divide-y">
            {citas.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  {c.accounts ? (
                    <Link href={`/cuentas/${c.accounts.id}`} className="font-medium hover:text-brand-carmesi">
                      {c.accounts.business_name ?? "Sin cliente"}
                    </Link>
                  ) : (
                    <span className="font-medium">Sin cliente</span>
                  )}
                  {c.accounts?.client_number && <span className="text-xs text-muted-foreground"> · #{c.accounts.client_number}</span>}
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  {formatDateTime(c.activity_date)} · {c.activity_type}
                  {c.status !== "agendada" && <span className="ml-1 text-amber-600">({c.status})</span>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}

      {canEdit && r.status !== "rechazada" && (
        <AddCitasToSample requestId={r.id} citas={attachableCitas} linkedAccountIds={distinctAccountIds} />
      )}

      {isAdmin && (
        <SampleReviewActions
          requestId={r.id}
          repId={rep.id}
          status={r.status ?? "borrador"}
          accountId={r.account_id}
          accountIds={distinctAccountIds}
          items={items.map((i) => ({ product_id: i.product_id, product_name: i.product_name }))}
        />
      )}
    </div>
  );
}
