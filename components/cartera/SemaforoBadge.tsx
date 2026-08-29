import { Badge } from "@/components/ui/badge";
import { semaforoCobranza } from "@/lib/cobranza";

type Props = {
  saldoPendiente: number;
  saldoVencido: number;
  totalPagado?: number | null;
  ultimoPagoVencidoFecha?: string | null;
  creditDays?: number | null;
  /** Días vencidos (de v_account_balance). Si se provee, el semáforo usa la
   *  política por días (alerta/vencido/suspendido). Si no, cae al modo simple. */
  diasVencido?: number | null;
};

export function SemaforoBadge({ saldoPendiente, saldoVencido, totalPagado, ultimoPagoVencidoFecha, diasVencido, creditDays }: Props) {
  if (diasVencido != null || creditDays === 0) {
    const s = semaforoCobranza(
      diasVencido ?? 0,
      saldoPendiente,
      totalPagado,
      ultimoPagoVencidoFecha,
      new Date(),
      creditDays,
    );
    return <Badge variant={s.variant}>{s.label}</Badge>;
  }
  // Modo simple (compatibilidad cuando no hay días vencidos).
  if (saldoVencido > 0) return <Badge variant="danger">Vencido</Badge>;
  if (saldoPendiente > 0) return <Badge variant="warning">Por cobrar</Badge>;
  return <Badge variant="success">Al corriente</Badge>;
}
