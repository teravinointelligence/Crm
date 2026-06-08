import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BODEGA_CATEGORIAS } from "@/lib/bank/bodegas";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Rentas de bodega — TERAVINO CRM" };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function BodegasPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  if (!(await isAdmin())) redirect("/cartera");
  const supabase = createClient();

  // Mes actual en zona Mazatlán (Los Cabos), o el de la URL.
  const mznNow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mazatlan",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? searchParams.mes! : mznNow;
  const inicio = `${mes}-01`;
  const fin = `${shiftMonth(mes, 1)}-01`;
  const [yy, mm] = mes.split("-").map(Number);

  const [{ data: delMes }, { data: historico }] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select("cargo_categoria, txn_date, amount, description")
      .not("cargo_categoria", "is", null)
      .gte("txn_date", inicio)
      .lt("txn_date", fin),
    // Último monto conocido por categoría (para mostrar el "esperado" en pendientes).
    supabase
      .from("bank_transactions")
      .select("cargo_categoria, amount, txn_date")
      .not("cargo_categoria", "is", null)
      .order("txn_date", { ascending: false }),
  ]);

  type Row = { cargo_categoria: string; txn_date: string | null; amount: number; description?: string };
  const pagosMes = new Map<string, Row>();
  for (const r of (delMes ?? []) as Row[]) {
    if (!pagosMes.has(r.cargo_categoria)) pagosMes.set(r.cargo_categoria, r);
  }
  const ultimoMonto = new Map<string, number>();
  for (const r of (historico ?? []) as Row[]) {
    if (!ultimoMonto.has(r.cargo_categoria)) ultimoMonto.set(r.cargo_categoria, Number(r.amount ?? 0));
  }

  const filas = BODEGA_CATEGORIAS.map((c) => {
    const pago = pagosMes.get(c.key);
    return {
      ...c,
      pagada: !!pago,
      monto: pago ? Number(pago.amount) : (ultimoMonto.get(c.key) ?? null),
      fecha: pago?.txn_date ?? null,
    };
  });

  const totalPagado = filas.filter((f) => f.pagada).reduce((s, f) => s + (f.monto ?? 0), 0);
  const totalPendiente = filas.filter((f) => !f.pagada).reduce((s, f) => s + (f.monto ?? 0), 0);
  const pagadas = filas.filter((f) => f.pagada).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cartera/conciliacion">
            <ArrowLeft className="mr-1 h-4 w-4" /> Conciliación
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Rentas de bodega</h1>
          <p className="text-sm text-muted-foreground">
            Pagos de renta y mantenimiento por bodega. Se llenan al etiquetar los cargos en conciliación.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon">
            <Link href={`/cartera/bodegas?mes=${shiftMonth(mes, -1)}`}><ChevronLeft className="h-4 w-4" /></Link>
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium capitalize">
            {MESES[mm - 1]} {yy}
          </span>
          <Button asChild variant="outline" size="icon">
            <Link href={`/cartera/bodegas?mes=${shiftMonth(mes, 1)}`}><ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pagadas" value={`${pagadas} / ${filas.length}`} />
        <Stat label="Pagado este mes" value={formatCurrency(totalPagado)} />
        <Stat label="Pendiente (estimado)" value={formatCurrency(totalPendiente)} danger />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Bodega / concepto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.key} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{f.bodega}</div>
                    <div className="text-xs capitalize text-muted-foreground">{f.tipo}</div>
                  </td>
                  <td className="px-4 py-3">
                    {f.pagada ? (
                      <Badge variant="success"><Check className="mr-1 h-3 w-3" /> Pagada</Badge>
                    ) : (
                      <Badge variant="warning"><Clock className="mr-1 h-3 w-3" /> Pendiente</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{f.fecha ? formatDate(f.fecha) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {f.monto != null ? (
                      <span className={f.pagada ? "font-medium" : "text-muted-foreground"}>
                        {formatCurrency(f.monto)}
                        {!f.pagada && <span className="ml-1 text-xs">(esperado)</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        "Esperado" es el último monto que se etiquetó para esa bodega. Una renta se marca como pagada
        cuando hay un cargo etiquetado con esa bodega dentro del mes.
      </p>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`font-display text-xl ${danger ? "text-amber-700" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
