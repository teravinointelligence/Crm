"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StockBadge } from "./StockBadge";
import { applyRegionPrice } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";
import { PRODUCT_CATEGORIES, type Product } from "@/types/database";

const ALL = "_all";

export function ProductsListClient({
  products,
  isAdmin,
}: {
  products: Product[];
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [showInactive, setShowInactive] = useState(false);

  const suppliers = useMemo(
    () => Array.from(new Set(products.map((p) => p.supplier))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (supplier !== ALL && p.supplier !== supplier) return false;
      if (category !== ALL && p.category !== category) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !(p.sku ?? "").toLowerCase().includes(q) &&
        !(p.varietal ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [products, query, supplier, category, showInactive]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, SKU, varietal…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los proveedores</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {PRODUCT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Incluir inactivos
        </label>
        {isAdmin && (
          <>
            <Button asChild variant="outline">
              <Link href="/catalogo/importar">
                <Upload className="mr-1 h-4 w-4" /> Importar Excel
              </Link>
            </Button>
            <Button asChild>
              <Link href="/catalogo/nuevo">
                <Plus className="mr-1 h-4 w-4" /> Nuevo producto
              </Link>
            </Button>
          </>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} de {products.length} productos
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin productos"
          description="Limpia los filtros o importa el catálogo desde CONTPAQi."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Precio base</th>
                <th className="px-4 py-3 text-right">+10%</th>
                <th className="px-4 py-3">Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/catalogo/${p.id}`}
                      className="font-medium hover:text-brand-carmesi"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[p.sku, p.varietal, p.vintage].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.supplier}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">
                    {p.category?.replace("_", " ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(applyRegionPrice(p.base_price, "base"))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-brand-carmesi">
                      {formatCurrency(applyRegionPrice(p.base_price, "+10"))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge
                      quantity={p.stock_quantity}
                      minAlert={p.stock_min_alert}
                    />
                    {!p.active && (
                      <Badge variant="muted" className="ml-1">
                        Inactivo
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
