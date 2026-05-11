import { Badge } from "@/components/ui/badge";

type Props = {
  quantity: number | null | undefined;
  minAlert: number | null | undefined;
};

export function StockBadge({ quantity, minAlert }: Props) {
  const qty = quantity ?? 0;
  const min = minAlert ?? 6;
  if (qty <= 0) return <Badge variant="danger">Agotado</Badge>;
  if (qty <= min) return <Badge variant="warning">Stock bajo · {qty}</Badge>;
  return <Badge variant="success">Stock · {qty}</Badge>;
}
