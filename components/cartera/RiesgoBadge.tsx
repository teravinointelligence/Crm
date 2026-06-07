import { Badge } from "@/components/ui/badge";
import { clasificarRiesgo } from "@/lib/cobranza";

type Props = {
  diasVencido: number | null | undefined;
  saldoVencido: number | null | undefined;
  isLegacy?: boolean | null;
  ventanaRevision?: number | null;
  ventanaSuspension?: number | null;
  /** Muestra el detalle del porqué debajo del badge. */
  withDetail?: boolean;
};

export function RiesgoBadge({ withDetail, ...params }: Props) {
  const r = clasificarRiesgo(params);
  if (!withDetail) return <Badge variant={r.variant}>{r.clase}</Badge>;
  return (
    <div className="space-y-1">
      <Badge variant={r.variant}>{r.clase}</Badge>
      <p className="text-xs text-muted-foreground">{r.detalle}</p>
    </div>
  );
}
