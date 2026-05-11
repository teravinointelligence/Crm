import { formatCurrency } from "@/lib/utils";
import { applyRegionPrice, withIVA } from "@/lib/pricing";

export function PriceBadge({ basePrice }: { basePrice: number }) {
  const base = applyRegionPrice(basePrice, "base");
  const plus = applyRegionPrice(basePrice, "+10");
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border bg-card p-3 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Base · Cabos / PV / Nay / TS
        </div>
        <div className="font-display text-xl">{formatCurrency(base)}</div>
        <div className="text-xs text-muted-foreground">
          c/IVA {formatCurrency(withIVA(base))}
        </div>
      </div>
      <div className="rounded-md bg-accent/10 p-2">
        <div className="text-xs uppercase tracking-wide text-brand-carmesi">
          +10% · La Paz / Tijuana
        </div>
        <div className="font-display text-xl text-brand-carmesi">
          {formatCurrency(plus)}
        </div>
        <div className="text-xs text-muted-foreground">
          c/IVA {formatCurrency(withIVA(plus))}
        </div>
      </div>
    </div>
  );
}
