"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { AccountCombobox } from "@/components/accounts/AccountCombobox";
import { WAREHOUSES } from "@/lib/warehouses";
import { createClient } from "@/lib/supabase/client";
import {
  applyRegionPrice,
  discountStatusFor,
  orderTotals,
  MAX_VENDOR_DISCOUNT_PCT,
} from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";
import type { Account, PriceTier, Product } from "@/types/database";

type LineItem = {
  key: string;
  product_id: string | null;
  product_name: string;
  supplier: string | null;
  vintage: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
};

type Props = {
  accounts: Pick<
    Account,
    "id" | "business_name" | "region" | "price_tier" | "fiscal_name" | "client_number"
  >[];
  products: Product[];
  repId: string;
  isAdmin: boolean;
  defaultAccountId?: string;
};

export function OrderForm({
  accounts,
  products,
  repId,
  isAdmin,
  defaultAccountId,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [orderType, setOrderType] = useState<"cotizacion" | "pedido">(
    "cotizacion",
  );
  const [warehouse, setWarehouse] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [query, setQuery] = useState("");
  const [discountPct, setDiscountPct] = useState(0);

  const account = accounts.find((a) => a.id === accountId);
  const tier: PriceTier =
    (account?.price_tier as PriceTier) ?? "base";

  const subtotal = items.reduce(
    (sum, i) => sum + (i.quantity * i.unit_price || 0),
    0,
  );
  const discountStatus = discountStatusFor(discountPct, isAdmin);
  const { discount, iva, total } = orderTotals(subtotal, discountPct, discountStatus);
  const discountPendiente = discountStatus === "pendiente";

  const activeProducts = useMemo(
    () => products.filter((p) => p.active !== false),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeProducts.slice(0, 16);
    const tokens = q.split(/\s+/);
    return activeProducts
      .filter((p) => {
        const hay = [
          p.name,
          p.supplier,
          p.varietal ?? "",
          p.country ?? "",
          p.region_origin ?? "",
          p.vintage ?? "",
          p.sku ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 60);
  }, [activeProducts, query]);

  const addProduct = (product: Product) => {
    const unitPrice = applyRegionPrice(product.base_price, tier);
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        supplier: product.supplier,
        vintage: product.vintage,
        quantity: 1,
        unit: "botella",
        unit_price: unitPrice,
      },
    ]);
    setQuery("");
  };

  const addBlank = () => {
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_id: null,
        product_name: "",
        supplier: null,
        vintage: null,
        quantity: 1,
        unit: "botella",
        unit_price: 0,
      },
    ]);
  };

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleSave = (status: "borrador" | "enviada") => {
    if (!accountId) {
      toast.error("Selecciona un cliente");
      return;
    }
    if (!items.length) {
      toast.error("Agrega al menos un producto");
      return;
    }
    const invalid = items.find(
      (i) => !i.product_name.trim() || i.quantity <= 0 || i.unit_price <= 0,
    );
    if (invalid) {
      toast.error("Revisa que las líneas tengan nombre, cantidad y precio");
      return;
    }
    if (orderType === "pedido" && !warehouse) {
      toast.error("Elige el almacén de salida del pedido");
      return;
    }

    startTransition(async () => {
      const itemsPayload = items.map((i) => ({
        product_id: i.product_id ?? null,
        product_name: i.product_name,
        supplier: i.supplier ?? null,
        vintage: i.vintage ?? null,
        quantity: i.quantity,
        unit: i.unit ?? "botella",
        unit_price: i.unit_price,
        line_total: Math.round(i.quantity * i.unit_price * 100) / 100,
      }));

      const { data: orderId, error: createError } = await supabase.rpc(
        "create_order",
        {
          p_account_id: accountId,
          p_sales_rep_id: repId,
          p_order_type: orderType,
          p_warehouse: orderType === "pedido" ? warehouse : warehouse || null,
          p_status: status,
          p_subtotal: subtotal,
          p_iva: iva,
          p_total: total,
          p_notes: notes || null,
          p_discount_pct: discountPct || 0,
          p_discount_requested_by: discountPct > 0 ? repId : null,
          p_discount_authorized_by: discountPct > 0 && isAdmin ? repId : null,
          p_discount_authorized_at: discountPct > 0 && isAdmin ? new Date().toISOString() : null,
          p_items: itemsPayload,
        },
      );

      if (createError || !orderId) {
        toast.error("No pudimos crear la orden", {
          description: createError?.message,
        });
        return;
      }

      // Obtener el folio generado para mostrarlo en el toast.
      const { data: orderRow } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .single();
      const orderNumber = orderRow?.order_number ?? "";

      // Al "Crear y enviar" un PEDIDO, lo mandamos automáticamente a
      // pedidos@teravino.com como solicitud de facturación (con PDF). Las
      // cotizaciones y los borradores no se envían.
      if (status === "enviada" && orderType === "pedido") {
        const res = await fetch(`/api/orders/${orderId}/enviar`, {
          method: "POST",
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error("Pedido creado, pero falló el envío a pedidos@", {
            description: d.error ?? `HTTP ${res.status}`,
          });
          router.push(`/pedidos/${orderId}`);
          router.refresh();
          return;
        }
        toast.success(`${orderNumber} enviado a pedidos@teravino.com`);
      } else {
        toast.success(`${orderNumber} creada`);
      }

      router.push(`/pedidos/${orderId}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Cliente *</Label>
            <AccountCombobox
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
            />
            {account && (
              <div className="text-xs text-muted-foreground">
                Región: <strong>{account.region ?? "—"}</strong> · Tier:{" "}
                <Badge variant={tier === "+10" ? "accent" : "muted"}>
                  {tier === "+10" ? "+10%" : "Base"}
                </Badge>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={orderType}
              onValueChange={(v) => setOrderType(v as "cotizacion" | "pedido")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cotizacion">Cotización (COT)</SelectItem>
                <SelectItem value="pedido">Pedido (PED)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Almacén de salida{" "}
              {orderType === "pedido" ? (
                <span className="text-brand-carmesi">*</span>
              ) : (
                <span className="text-xs text-muted-foreground">(opcional en cotización)</span>
              )}
            </Label>
            <Select value={warehouse} onValueChange={setWarehouse}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona almacén" />
              </SelectTrigger>
              <SelectContent>
                {WAREHOUSES.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg">Líneas</h3>
            <Button type="button" variant="outline" onClick={addBlank} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Producto manual
            </Button>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Buscar entre ${activeProducts.length} vinos del catálogo (nombre, bodega, varietal, país, añada…)`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {!accountId ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Selecciona el cliente arriba para ver el precio según su región y poder agregar los vinos.
              </p>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  {query.trim()
                    ? `${filteredProducts.length} coincidencia(s)${filteredProducts.length >= 60 ? "+ — afina la búsqueda" : ""}`
                    : `Mostrando los primeros ${filteredProducts.length} — escribe para buscar entre los ${activeProducts.length}`}
                </div>
                {filteredProducts.length > 0 ? (
                  <div className="grid max-h-96 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="rounded-md border bg-card p-3 text-left text-sm hover:border-brand-carmesi"
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.supplier, p.varietal, p.country, p.vintage]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="mt-1 font-display text-brand-carmesi">
                          {formatCurrency(applyRegionPrice(p.base_price, tier))}
                          {tier === "+10" && (
                            <span className="ml-1 text-xs text-muted-foreground">(+10%)</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Sin coincidencias. Usa “Producto manual” si el vino no está en el catálogo.
                  </p>
                )}
              </>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no agregaste productos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2">Producto</th>
                    <th className="py-2 pr-2 w-20">Cant.</th>
                    <th className="py-2 pr-2 w-28">Precio</th>
                    <th className="py-2 pr-2 w-28 text-right">Total</th>
                    <th className="py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const lineTotal = i.quantity * i.unit_price;
                    return (
                      <tr key={i.key} className="border-b align-top">
                        <td className="py-2 pr-2">
                          <Input
                            value={i.product_name}
                            onChange={(e) =>
                              updateItem(i.key, {
                                product_name: e.target.value,
                              })
                            }
                            placeholder="Nombre del producto"
                          />
                          {i.supplier && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {[i.supplier, i.vintage]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            value={i.quantity}
                            onChange={(e) =>
                              updateItem(i.key, {
                                quantity: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={i.unit_price}
                            onChange={(e) =>
                              updateItem(i.key, {
                                unit_price: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2 text-right font-medium">
                          {formatCurrency(lineTotal)}
                        </td>
                        <td className="py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            onClick={() => removeItem(i.key)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1 border-t pt-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="order_discount" className="text-muted-foreground">
                Descuento (%)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="order_discount"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={discountPct}
                  onChange={(e) =>
                    setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="h-8 w-20 text-right"
                />
                <span className="w-28 text-right text-muted-foreground">
                  {discount > 0 ? `- ${formatCurrency(discount)}` : "—"}
                </span>
              </div>
            </div>
            {discountPendiente && (
              <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                {MAX_VENDOR_DISCOUNT_PCT > 0
                  ? `Arriba de ${MAX_VENDOR_DISCOUNT_PCT}%: `
                  : "El descuento "}
                quedará <strong>pendiente de autorización</strong> y no se aplica al total hasta
                que un admin lo autorice.
              </p>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>IVA 16%</span>
              <span>{formatCurrency(iva)}</span>
            </div>
            <div className="flex justify-between font-display text-xl">
              <span>Total</span>
              <span className="text-brand-carmesi">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-6">
          <Label htmlFor="notes">Notas para el cliente</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condiciones, plazo de entrega, etc."
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button
          variant="ghost"
          onClick={() => handleSave("borrador")}
          disabled={pending}
        >
          Guardar como borrador
        </Button>
        <Button onClick={() => handleSave("enviada")} disabled={pending}>
          {pending ? "Guardando…" : "Crear y enviar"}
        </Button>
      </div>
    </div>
  );
}
