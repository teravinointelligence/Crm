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
import { createClient } from "@/lib/supabase/client";
import { applyRegionPrice, ivaAmount, withIVA } from "@/lib/pricing";
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
  accounts: Pick<Account, "id" | "business_name" | "region" | "price_tier">[];
  products: Product[];
  repId: string;
  defaultAccountId?: string;
};

export function OrderForm({
  accounts,
  products,
  repId,
  defaultAccountId,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [orderType, setOrderType] = useState<"cotizacion" | "pedido">(
    "cotizacion",
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [query, setQuery] = useState("");

  const account = accounts.find((a) => a.id === accountId);
  const tier: PriceTier =
    (account?.price_tier as PriceTier) ?? "base";

  const subtotal = items.reduce(
    (sum, i) => sum + (i.quantity * i.unit_price || 0),
    0,
  );
  const iva = ivaAmount(subtotal);
  const total = withIVA(subtotal);

  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products.slice(0, 8);
    const q = query.toLowerCase();
    return products
      .filter(
        (p) =>
          p.active !== false &&
          (p.name.toLowerCase().includes(q) ||
            (p.sku ?? "").toLowerCase().includes(q) ||
            (p.varietal ?? "").toLowerCase().includes(q) ||
            p.supplier.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [products, query]);

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

    startTransition(async () => {
      const { data: numberRes, error: numberError } = await supabase.rpc(
        "next_order_number",
        { p_order_type: orderType },
      );
      if (numberError || !numberRes) {
        toast.error("No pudimos generar el número de orden", {
          description: numberError?.message,
        });
        return;
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          order_number: numberRes,
          account_id: accountId,
          sales_rep_id: repId,
          order_type: orderType,
          status,
          subtotal,
          iva,
          total,
          notes: notes || null,
        })
        .select("id")
        .single();

      if (orderError || !order) {
        toast.error("No pudimos crear la orden", {
          description: orderError?.message,
        });
        return;
      }

      const payload = items.map((i) => ({
        order_id: order.id,
        product_id: i.product_id,
        product_name: i.product_name,
        supplier: i.supplier,
        vintage: i.vintage,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        line_total: Math.round(i.quantity * i.unit_price * 100) / 100,
      }));
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(payload);
      if (itemsError) {
        toast.error("Líneas no se guardaron", {
          description: itemsError.message,
        });
        return;
      }

      toast.success(`${numberRes} creada`);
      router.push(`/pedidos/${order.id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Cliente *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.business_name}
                    {a.region ? ` · ${a.region}` : ""}
                    {a.price_tier === "+10" ? " (+10%)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {account && (
              <p className="text-xs text-muted-foreground">
                Región: <strong>{account.region ?? "—"}</strong> · Tier:{" "}
                <Badge variant={tier === "+10" ? "accent" : "muted"}>
                  {tier === "+10" ? "+10%" : "Base"}
                </Badge>
              </p>
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
                placeholder="Buscar producto del catálogo…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                disabled={!accountId}
              />
            </div>
            {accountId && filteredProducts.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="rounded-md border bg-card p-3 text-left text-sm hover:border-brand-carmesi"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.supplier, p.varietal, p.vintage]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="mt-1 font-display text-brand-carmesi">
                      {formatCurrency(applyRegionPrice(p.base_price, tier))}
                    </div>
                  </button>
                ))}
              </div>
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
