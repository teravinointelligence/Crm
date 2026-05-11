import { Badge } from "@/components/ui/badge";

type Props = {
  saldoPendiente: number;
  saldoVencido: number;
};

export function SemaforoBadge({ saldoPendiente, saldoVencido }: Props) {
  if (saldoVencido > 0) return <Badge variant="danger">Vencido</Badge>;
  if (saldoPendiente > 0) return <Badge variant="warning">Por cobrar</Badge>;
  return <Badge variant="success">Al corriente</Badge>;
}
