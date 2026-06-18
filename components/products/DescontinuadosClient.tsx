"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { STICKY_CELL, STICKY_HEAD } from "@/components/ui/table-sticky";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { Badge } from "@/components/ui/badge";
import { DiscontinueButton } from "./DiscontinueButton";
import { StockBadge } from "./StockBadge";
import { formatDate } from "@/lib/utils";
import type { Product } from "@/types/database";

export function DescontinuadosClient({ products, repId }: { products: Product[]; repId: string }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.varietal ?? "").toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q),
    );
  }, [products, query]);

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Productos descontinuados</h1>
          <p className="text-sm text-muted-foreground">
            Productos que ya no se reabastecen. Si aún tienen stock siguen vendibles en
            liquidación (últimas botellas) y aparecen en el catálogo con esa etiqueta; al
            agotarse desaparecen del catálogo. Puedes reactivar uno cuando vuelva a estar
            disponible.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/catalogo">
            <ArrowLeft className="mr-1 h-4 w-4" /> Volver al catálogo
          </Link>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, SKU, varietal, proveedor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {products.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {filtered.length} de {products.length} descontinuados
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Ban}
          title={products.length === 0 ? "Sin productos descontinuados" : "Sin coincidencias"}
          description={
            products.length === 0
              ? "Cuando descontinúes un producto desde su ficha, aparecerá aquí."
              : "Ajusta la búsqueda."
          }
        />
      ) : (
        <TableScroll stickyRight>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Stock / estado</th>
                <th className="px-4 py-3">Descontinuado</th>
                <th className={`px-4 py-3 ${STICKY_HEAD}`}></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/catalogo/${p.id}`} className="font-medium hover:text-brand-carmesi">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[p.sku, p.varietal, p.country, p.vintage].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.supplier}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {p.category?.replace("_", " ") ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StockBadge quantity={p.stock_quantity} minAlert={p.stock_min_alert} />
                      {(p.stock_quantity ?? 0) > 0 ? (
                        <Badge variant="warning">Liquidación</Badge>
                      ) : (
                        <Badge variant="muted">Agotado</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.discontinued_at ? formatDate(p.discontinued_at) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right ${STICKY_CELL}`}>
                    <DiscontinueButton
                      productId={p.id}
                      productName={p.name}
                      discontinued
                      repId={repId}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Pager page={page} pageCount={pageCount} total={total} onPageChange={setPage} />
    </div>
  );
}
