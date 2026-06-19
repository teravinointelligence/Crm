import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatCurrency } from "@/lib/utils";
import type { ProductCustomerRow } from "@/lib/product-customers";

// "mmm yyyy" en español a partir de un periodo YYYY-MM-DD (siempre día 1).
function monthLabel(period: string | null | undefined): string {
  if (!period) return "—";
  const d = new Date(`${period.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric" }).format(d);
}

// ¿La última compra es de los últimos ~90 días? (cliente "activo" en este vino)
function isRecent(period: string | null | undefined): boolean {
  if (!period) return false;
  const d = new Date(`${period.slice(0, 10)}T12:00:00`).getTime();
  return Date.now() - d < 100 * 24 * 60 * 60 * 1000;
}

export function ProductCustomersPanel({
  rows,
  partial,
}: {
  rows: ProductCustomerRow[];
  /** El usuario solo ve sus propias cuentas (no admin/finanzas). */
  partial: boolean;
}) {
  const totalUnidades = rows.reduce((s, r) => s + r.unidades, 0);
  const totalImporte = rows.reduce((s, r) => s + r.importe, 0);

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">Clientes que lo compran</h2>
            <p className="text-xs text-muted-foreground">
              Histórico de Ventas (CONTPAQi)
              {partial ? " · solo tus cuentas" : ""}
            </p>
          </div>
          {rows.length > 0 && (
            <div className="text-right text-sm">
              <span className="font-medium">{rows.length}</span>{" "}
              <span className="text-muted-foreground">
                {rows.length === 1 ? "cliente" : "clientes"}
              </span>
              <span className="text-muted-foreground">
                {" · "}
                {totalUnidades.toLocaleString("es-MX")} u ·{" "}
                {formatCurrency(totalImporte)}
              </span>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Aún no hay compras registradas de este producto
            {partial ? " entre tus cuentas" : ""}.
          </p>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 text-right font-medium">Unidades</th>
                  <th className="px-3 py-2 text-right font-medium">Importe</th>
                  <th className="px-3 py-2 text-right font-medium">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.account_id ?? r.cliente}
                    className="border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      {r.account_id ? (
                        <Link
                          href={`/cuentas/${r.account_id}`}
                          className="font-medium hover:underline"
                        >
                          {r.cliente}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.cliente}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.vendedor ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.unidades.toLocaleString("es-MX")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(r.importe)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className={isRecent(r.ultima) ? "" : "text-muted-foreground"}>
                        {monthLabel(r.ultima)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </CardContent>
    </Card>
  );
}
