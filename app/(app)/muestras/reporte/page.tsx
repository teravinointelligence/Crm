// Reporte de muestras solicitadas por vendedor entre dos fechas.
//
// A diferencia de /muestras/consumo (periodos fijos de 30/90/365 días y análisis
// de costo por encarte, solo admin/contador), aquí el rango lo elige el usuario
// y el corte es por vendedor con su detalle de solicitudes, para sacar el
// reporte de un mes, una quincena o cualquier periodo cerrado.
//
// El alcance lo pone RLS (migración 0010): admin ve a todo el equipo, el
// vendedor solo sus propias solicitudes.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SampleReportClient, type SampleReportRow } from "@/components/samples/SampleReportClient";
import { dateKeyTz, localInputToISO } from "@/lib/utils";

export const metadata = { title: "Reporte de muestras — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ReqRow = {
  id: string;
  request_number: string;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  training_people: number | null;
  sales_rep_id: string;
  sales_reps: { full_name: string | null } | null;
  accounts: { business_name: string | null; client_number: string | null } | null;
  sample_request_items: Array<{ product_id: string | null; product_name: string | null; quantity: number | null }> | null;
};

export default async function ReporteMuestrasPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  const hoy = dateKeyTz(new Date());
  // Por defecto, el mes en curso.
  const desde = DATE_RE.test(searchParams.desde ?? "") ? searchParams.desde! : `${hoy.slice(0, 7)}-01`;
  const hastaRaw = DATE_RE.test(searchParams.hasta ?? "") ? searchParams.hasta! : hoy;
  // Un rango invertido no devuelve nada: lo enderezamos en vez de mostrar vacío.
  const [desdeOk, hastaOk] = desde <= hastaRaw ? [desde, hastaRaw] : [hastaRaw, desde];

  const supabase = createClient();
  const [reqRes, prodRes] = await Promise.all([
    supabase
      .from("sample_requests")
      .select(
        "id, request_number, reason, status, created_at, training_people, sales_rep_id, sales_reps:sales_rep_id(full_name), accounts:account_id(business_name, client_number), sample_request_items(product_id, product_name, quantity)",
      )
      // Los límites son días completos en hora de Los Cabos, no UTC.
      .gte("created_at", localInputToISO(`${desdeOk}T00:00`))
      .lte("created_at", localInputToISO(`${hastaOk}T23:59`))
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("products").select("id, base_price").limit(5000),
  ]);

  const priceById = new Map(
    ((prodRes.data ?? []) as { id: string; base_price: number | null }[]).map((p) => [
      p.id,
      Number(p.base_price ?? 0),
    ]),
  );

  const rows: SampleReportRow[] = (((reqRes.data ?? []) as unknown) as ReqRow[]).map((r) => {
    let botellas = 0;
    let valor = 0;
    let sinPrecio = 0;
    const productos: string[] = [];
    for (const it of r.sample_request_items ?? []) {
      const qty = Number(it.quantity ?? 0);
      botellas += qty;
      const price = it.product_id ? priceById.get(it.product_id) : undefined;
      // Renglones manuales (sin producto del catálogo) no tienen precio de lista.
      if (price == null) sinPrecio += qty;
      else valor += qty * price;
      productos.push(`${qty} × ${it.product_name ?? "—"}`);
    }
    return {
      id: r.id,
      folio: r.request_number,
      fecha: r.created_at,
      repId: r.sales_rep_id,
      vendedor: r.sales_reps?.full_name ?? "—",
      cliente: r.accounts?.business_name ?? null,
      clientNumber: r.accounts?.client_number ?? null,
      motivo: r.reason,
      estatus: r.status ?? "—",
      botellas,
      valor,
      sinPrecio,
      capacitacionPersonas: r.training_people,
      productos: productos.join(", "),
    };
  });

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>

      <div>
        <h1 className="font-display text-3xl">Reporte de muestras por vendedor</h1>
        <p className="text-sm text-muted-foreground">
          Muestras solicitadas en el rango de fechas que elijas, agrupadas por vendedor y con el
          detalle de cada solicitud. Descargable en CSV.
          {rep.role !== "admin" && " Ves únicamente tus propias solicitudes."}
        </p>
      </div>

      <SampleReportClient rows={rows} desde={desdeOk} hasta={hastaOk} hoy={hoy} />
    </div>
  );
}
