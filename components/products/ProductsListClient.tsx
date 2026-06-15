"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search, Upload, Pencil, Tags, Wand2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { STICKY_CELL, STICKY_HEAD } from "@/components/ui/table-sticky";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { StockBadge } from "./StockBadge";
import { WAREHOUSES, WAREHOUSE_SHORT } from "@/lib/warehouses";
import { createClient } from "@/lib/supabase/client";
import { applyRegionPrice } from "@/lib/pricing";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PRODUCT_CATEGORIES, type Product } from "@/types/database";

const ALL = "_all";

export function ProductsListClient({
  products,
  warehouseStock = {},
  warehouseUpdated = {},
  riskIds = [],
  isAdmin,
}: {
  products: Product[];
  // product_id → { almacén: existencia } (carga vía Importar Excel → Inventario por almacén)
  warehouseStock?: Record<string, Record<string, number>>;
  // almacén → última fecha de actualización del inventario de ese almacén
  warehouseUpdated?: Record<string, string>;
  // product_ids en riesgo de quiebre (modelo de reabasto, ver /restock/sugerencias)
  riskIds?: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const riskSet = useMemo(() => new Set(riskIds), [riskIds]);
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [warehouse, setWarehouse] = useState<string>(ALL);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const suppliers = useMemo(
    () => Array.from(new Set(products.map((p) => p.supplier))).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (supplier !== ALL && p.supplier !== supplier) return false;
      if (category !== ALL && p.category !== category) return false;
      if (warehouse !== ALL && warehouseStock[p.id]?.[warehouse] == null)
        return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !(p.sku ?? "").toLowerCase().includes(q) &&
        !(p.varietal ?? "").toLowerCase().includes(q) &&
        !p.supplier.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [products, query, supplier, category, warehouse, warehouseStock, showInactive]);

  const { paged, page, pageCount, setPage, total } = usePagedRows(filtered);

  const saveSupplierForProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const newSupplier = String(fd.get("supplier") ?? "").trim();
    if (!newSupplier) {
      toast.error("El proveedor no puede quedar vacío");
      return;
    }
    startTransition(async () => {
      const { error } = await supabase
        .from("products")
        .update({ supplier: newSupplier })
        .eq("id", editing.id);
      if (error) {
        toast.error("No pudimos actualizar el proveedor", { description: error.message });
        return;
      }
      toast.success("Proveedor actualizado");
      setEditing(null);
      router.refresh();
    });
  };

  const bulkRename = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!renaming) return;
    const fd = new FormData(e.currentTarget);
    const newSupplier = String(fd.get("new_supplier") ?? "").trim();
    if (!newSupplier || newSupplier === renaming) {
      toast.error("Escribe un proveedor distinto");
      return;
    }
    startTransition(async () => {
      const { error, count } = await supabase
        .from("products")
        .update({ supplier: newSupplier }, { count: "exact" })
        .eq("supplier", renaming);
      if (error) {
        toast.error("No pudimos renombrar el proveedor", { description: error.message });
        return;
      }
      toast.success(`${count ?? 0} productos reasignados a "${newSupplier}"`);
      setRenaming(null);
      if (supplier === renaming) setSupplier(ALL);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, SKU, varietal, proveedor…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="sm:w-52">
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
        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Almacén" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los almacenes</SelectItem>
            {WAREHOUSES.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {warehouse !== ALL && (
          <span className="self-center text-xs text-muted-foreground">
            {warehouseUpdated[warehouse]
              ? `Inventario actualizado: ${formatDate(warehouseUpdated[warehouse])}`
              : "Sin fecha de actualización"}
          </span>
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Incluir inactivos
        </label>
        {isAdmin && supplier !== ALL && (
          <Button variant="outline" onClick={() => setRenaming(supplier)}>
            <Tags className="mr-1 h-4 w-4" /> Renombrar proveedor «{supplier}»
          </Button>
        )}
        {isAdmin && (
          <>
            <Button asChild variant="outline">
              <Link href="/catalogo/importar">
                <Upload className="mr-1 h-4 w-4" /> Importar Excel
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/catalogo/normalizar">
                <Wand2 className="mr-1 h-4 w-4" /> Normalizar
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/catalogo/mapeo-contpaq">
                <Link2 className="mr-1 h-4 w-4" /> Códigos CONTPAQ
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
        {filtered.length} de {products.length} productos · {suppliers.length} proveedores
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin productos"
          description={
            products.length === 0
              ? "Aún no hay productos: importa el catálogo o el portafolio para empezar."
              : "Limpia los filtros o importa el catálogo / portafolio."
          }
          action={
            isAdmin ? (
              <Button asChild className="mt-2">
                <Link href="/catalogo/importar">
                  <Upload className="mr-1 h-4 w-4" /> Importar Excel
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableScroll stickyRight={isAdmin}>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Proveedor / Bodega</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Precio base</th>
                <th className="px-4 py-3 text-right">+10%</th>
                <th className="px-4 py-3">
                  {warehouse === ALL ? "Stock" : `Stock · ${warehouse}`}
                </th>
                {isAdmin && <th className={`px-4 py-3 ${STICKY_HEAD}`}></th>}
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
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
                      {[p.sku, p.varietal, p.country, p.vintage].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-muted-foreground">{p.supplier}</span>
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
                    {warehouse === ALL ? (
                      <StockBadge
                        quantity={p.stock_quantity}
                        minAlert={p.stock_min_alert}
                      />
                    ) : warehouseStock[p.id]?.[warehouse] != null ? (
                      <StockBadge
                        quantity={warehouseStock[p.id][warehouse]}
                        minAlert={p.stock_min_alert}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sin dato
                      </span>
                    )}
                    {riskSet.has(p.id) && (
                      <Badge variant="danger" className="ml-1">
                        Riesgo de quiebre
                      </Badge>
                    )}
                    {!p.active && (
                      <Badge variant="muted" className="ml-1">
                        Inactivo
                      </Badge>
                    )}
                    {warehouse === ALL && warehouseStock[p.id] && (
                      <div className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                        {WAREHOUSES.filter(
                          (w) => warehouseStock[p.id][w] != null,
                        )
                          .map(
                            (w) =>
                              `${WAREHOUSE_SHORT[w]} ${warehouseStock[p.id][w]}`,
                          )
                          .join(" · ")}
                      </div>
                    )}
                  </td>
                  {isAdmin && (
                    <td className={`px-4 py-3 text-right ${STICKY_CELL}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(p)}
                        title="Editar proveedor / bodega"
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Proveedor
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Pager page={page} pageCount={pageCount} total={total} onPageChange={setPage} />

      {/* Edit single product's supplier */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proveedor / bodega del producto</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={saveSupplierForProduct} className="grid gap-3">
              <p className="text-sm text-muted-foreground">{editing.name}</p>
              <div className="space-y-1.5">
                <Label htmlFor="supplier">Proveedor / bodega</Label>
                <Input
                  id="supplier"
                  name="supplier"
                  required
                  defaultValue={editing.supplier}
                  list="all-suppliers"
                  autoFocus
                />
                <datalist id="all-suppliers">
                  {suppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <p className="text-xs text-muted-foreground">
                Para más campos (categoría, varietal, precio, stock…) abre el detalle del producto.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk rename a supplier across all its products */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar / reasignar proveedor</DialogTitle>
          </DialogHeader>
          {renaming && (
            <form onSubmit={bulkRename} className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                Todos los productos con proveedor <strong>«{renaming}»</strong> pasarán al
                proveedor que escribas (útil cuando la bodega del portafolio debe ser un
                distribuidor — p.ej. todo lo de «Tapiz» → «Vernazza»).
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="new_supplier">Nuevo proveedor</Label>
                <Input
                  id="new_supplier"
                  name="new_supplier"
                  required
                  defaultValue={renaming}
                  list="all-suppliers"
                  autoFocus
                />
                <datalist id="all-suppliers">
                  {suppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setRenaming(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Aplicando…" : "Reasignar todos"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
