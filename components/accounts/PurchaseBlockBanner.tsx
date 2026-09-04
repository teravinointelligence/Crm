// Aviso compacto de "esta cuenta no puede comprar" para el Resumen de la ficha.
// El panel completo (historial, alta, reapertura) vive en la pestaña
// Seguimiento; aquí solo se avisa, porque es lo primero que el vendedor tiene
// que ver antes de planear una visita o meterle un pedido.
import Link from "next/link";
import { Pause } from "lucide-react";
import { BLOCK_REASON_LABEL, type PurchaseBlock } from "@/lib/purchase-blocks";
import { formatDate } from "@/lib/utils";

export function PurchaseBlockBanner({
  accountId,
  block,
}: {
  accountId: string;
  block: Pick<PurchaseBlock, "reason" | "start_date" | "end_date" | "note">;
}) {
  return (
    <Link
      href={`/cuentas/${accountId}?tab=seguimiento`}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm transition-colors hover:border-amber-400"
    >
      <Pause className="h-4 w-4 shrink-0 text-amber-700" />
      <span className="font-medium text-amber-900">
        No puede comprar · {BLOCK_REASON_LABEL[block.reason]}
      </span>
      <span className="text-amber-900/80">
        {block.end_date
          ? `hasta el ${formatDate(block.end_date)}`
          : `desde el ${formatDate(block.start_date)}, sin fecha de reapertura`}
      </span>
      {block.note && <span className="w-full text-xs text-amber-900/80">{block.note}</span>}
    </Link>
  );
}
