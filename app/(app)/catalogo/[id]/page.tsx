import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriceBadge } from "@/components/products/PriceBadge";
import { StockBadge } from "@/components/products/StockBadge";
import { formatDateTime } from "@/lib/utils";

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl">{product.name}</h1>
            {!product.active && <Badge variant="muted">Inactivo</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[
              product.supplier,
              product.varietal,
              product.country,
              product.region_origin,
              product.vintage,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href={`/catalogo/${product.id}/editar`}>Editar</Link>
          </Button>
        )}
      </div>

      <PriceBadge basePrice={product.base_price} />

      <Card>
        <CardContent className="grid gap-3 p-6 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">SKU</div>
            <div className="text-sm">{product.sku ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Volumen
            </div>
            <div className="text-sm">{product.volume_ml} ml</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Categoría
            </div>
            <div className="text-sm capitalize">
              {product.category?.replace("_", " ") ?? "—"}
            </div>
          </div>
          <div className="sm:col-span-3">
            <div className="text-xs uppercase text-muted-foreground">Stock</div>
            <div className="mt-1 flex items-center gap-2">
              <StockBadge
                quantity={product.stock_quantity}
                minAlert={product.stock_min_alert}
              />
              {product.last_stock_update && (
                <span className="text-xs text-muted-foreground">
                  Actualizado {formatDateTime(product.last_stock_update)}
                  {product.last_stock_source
                    ? ` · ${product.last_stock_source}`
                    : ""}
                </span>
              )}
            </div>
          </div>
          {product.notes && (
            <div className="sm:col-span-3 border-t pt-3">
              <div className="text-xs uppercase text-muted-foreground">
                Notas
              </div>
              <div className="text-sm">{product.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
