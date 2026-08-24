import Link from "next/link";
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { RestockEvaluation } from "@/lib/restock-review";

const VERDICT = {
  justificado: { label: "Justificado", variant: "success" as const, Icon: CheckCircle2 },
  reducir: { label: "Reducir", variant: "warning" as const, Icon: AlertTriangle },
  no_recomendado: { label: "No recomendado", variant: "danger" as const, Icon: ShieldAlert },
  datos_insuficientes: { label: "Datos insuficientes", variant: "muted" as const, Icon: HelpCircle },
};

export function RestockInventoryEvaluation({ rows }: { rows: RestockEvaluation[] }) {
  const alerts = rows.filter((row) => row.verdict === "reducir" || row.verdict === "no_recomendado").length;
  const needsData = rows.some((row) => row.verdict === "datos_insuficientes");
  return <Card className={alerts ? "border-amber-300" : "border-emerald-200"}><CardContent className="space-y-4 p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-xl">Evaluación contra inventario y ventas</h2><p className="text-sm text-muted-foreground">Apoyo para decidir antes de aprobar. La recomendación no sustituye la revisión comercial.</p></div>{needsData ? <Button asChild variant="outline" size="sm"><Link href="/catalogo/importar"><RefreshCw className="mr-1 h-4 w-4" /> Actualizar desde Drive</Link></Button> : null}</div>
    <div className="overflow-x-auto rounded-lg border"><table className="min-w-full text-sm"><thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2 text-right">Venta/mes</th><th className="px-3 py-2 text-right">Cobertura</th><th className="px-3 py-2 text-right">Pedido</th><th className="px-3 py-2 text-right">Sugerido</th><th className="px-3 py-2">Resultado</th></tr></thead>
      <tbody>{rows.map((row) => { const verdict = VERDICT[row.verdict]; return <tr key={row.itemId} className="border-b last:border-0 align-top">
        <td className="px-3 py-3"><div className="font-medium">{row.productName}</div><div className="mt-1 text-xs text-muted-foreground">{row.warehouse ?? "Sin almacén"}{row.inventoryDate ? ` · inventario ${formatDate(row.inventoryDate)}` : ""}</div>{row.inventorySource ? <div className="text-xs text-muted-foreground">{row.inventorySource}</div> : null}</td>
        <td className="px-3 py-3 text-right">{row.stock ?? "—"}</td><td className="px-3 py-3 text-right">{row.salesPerMonth ?? "—"}</td><td className="px-3 py-3 text-right">{row.currentCoverDays == null ? "—" : `${row.currentCoverDays}d`}{row.projectedCoverDays == null ? "" : <div className="text-xs text-muted-foreground">con pedido: {row.projectedCoverDays}d</div>}</td>
        <td className="px-3 py-3 text-right font-medium">{row.requested}</td><td className="px-3 py-3 text-right">{row.suggestedQty ?? "—"}</td><td className="max-w-60 px-3 py-3"><Badge variant={verdict.variant}><verdict.Icon className="mr-1 h-3 w-3" />{verdict.label}</Badge><p className="mt-1 text-xs text-muted-foreground">{row.reason}</p></td>
      </tr>; })}</tbody></table></div>
  </CardContent></Card>;
}
