"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import type {
  Base44Cliente,
  Base44Producto,
  Base44Vendedor,
} from "@/lib/base44";

type LineItem = {
  key: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
};

type Props = {
  isAdmin: boolean;
  clientes: Base44Cliente[];
  productos: Base44Producto[];
  vendedores: Base44Vendedor[]; // vacío para rep (no se usa)
  ownVendedor: Base44Vendedor | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ConsignacionForm({
  isAdmin,
  clientes,
  productos,
  vendedores,
  ownVendedor,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [clienteId, setClienteId] = useState<string>("");
  const [clienteQuery, setClienteQuery] = useState("");
  const [vendedorId, setVendedorId] = useState<string>(ownVendedor?.id ?? "");
  const [fecha, setFecha] = useState<string>(today());
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [productQuery, setProductQuery] = useState("");

  const cliente = clientes.find((c) => c.id === clienteId);

  const filteredClientes = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) {
      // Por defecto preferimos los marcados con tiene_consignacion arriba.
      const prefer = clientes.filter((c) => c.tiene_consignacion);
      const rest = clientes.filter((c) => !c.tiene_consignacion);
      return [...prefer, ...rest].slice(0, 30);
    }
    const tokens = q.split(/\s+/);
    return clientes
      .filter((c) => {
        const hay = [c.nombre, c.numero_cliente, c.razon_social, c.locacion]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 30);
  }, [clientes, clienteQuery]);

  // Reporte de limpieza: consignables sin precio en TERAVINO Flow (ej. Clos du
  // Temple). El precio real se corrige allá o se captura a mano en el renglón.
  const consignablesSinPrecio = useMemo(
    () => productos.filter((p) => !(Number(p.precio_unitario) > 0)).length,
    [productos],
  );

  const filteredProductos = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return productos.slice(0, 20);
    const tokens = q.split(/\s+/);
    return productos
      .filter((p) => {
        const hay = [p.nombre, p.bodega, p.codigo, p.tipo].filter(Boolean).join(" ").toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 60);
  }, [productos, productQuery]);

  const addProduct = (p: Base44Producto) => {
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        producto_id: p.id,
        producto_nombre: p.nombre,
        cantidad: 1,
        precio_unitario: p.precio_unitario ?? 0,
      },
    ]);
    setProductQuery("");
    // El catálogo trae productos con precio $0 (ej. Clos du Temple). Se pueden
    // agregar, pero el renglón queda inválido hasta capturar el precio a mano.
    if (!(Number(p.precio_unitario) > 0)) {
      toast.warning(`"${p.nombre}" no tiene precio en el catálogo`, {
        description: "Captura el precio unitario en el renglón para poder crear la consignación.",
      });
    }
  };

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  const updateItem = (key: string, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const total = useMemo(
    () =>
      Math.round(
        items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0) *
          100,
      ) / 100,
    [items],
  );

  // Precio ≤ 0 bloquea el submit: no se crean consignaciones con total $0.00.
  const hasPrecioCero = items.some((i) => !(Number(i.precio_unitario) > 0));
  const canSubmit =
    !!clienteId &&
    !!fecha &&
    items.length > 0 &&
    items.every((i) => i.cantidad > 0 && i.precio_unitario > 0) &&
    total > 0;

  const submit = () => {
    if (!canSubmit) {
      toast.error(
        hasPrecioCero
          ? "Cada producto debe tener un precio unitario mayor a $0.00"
          : "Completa cliente, fecha y al menos un item válido",
      );
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/consignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: clienteId,
          vendedor_id: isAdmin ? vendedorId : undefined,
          fecha,
          items: items.map((i) => ({
            producto_id: i.producto_id,
            cantidad: Number(i.cantidad),
            precio_unitario: Number(i.precio_unitario),
          })),
          notas: notas.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("Error al crear consignación", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const { id } = (await res.json()) as { id: string };
      toast.success("Consignación creada");
      router.push(`/consignaciones/${id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-display text-lg">Cliente y vendedor</h2>

          {/* Cliente */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            {cliente ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
                <div>
                  <p className="font-medium">{cliente.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {cliente.numero_cliente ? `# ${cliente.numero_cliente} · ` : ""}
                    {cliente.locacion ?? "—"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setClienteId("")}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre, # cliente, razón social..."
                    value={clienteQuery}
                    onChange={(e) => setClienteQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  {filteredClientes.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">Sin resultados.</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {filteredClientes.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setClienteId(c.id);
                              setClienteQuery("");
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                          >
                            <div>
                              <p className="font-medium">{c.nombre}</p>
                              <p className="text-xs text-muted-foreground">
                                {c.numero_cliente ? `# ${c.numero_cliente} · ` : ""}
                                {c.locacion ?? "—"}
                              </p>
                            </div>
                            {c.tiene_consignacion && <Badge variant="accent">consignación</Badge>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Vendedor */}
          {isAdmin ? (
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nombre} {v.zona ? `· ${v.zona}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <p className="text-sm">{ownVendedor?.nombre}</p>
            </div>
          )}

          {/* Fecha */}
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Productos</h2>
            <span className="text-xs text-muted-foreground">{items.length} en la consignación</span>
          </div>

          {consignablesSinPrecio > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {consignablesSinPrecio} producto{consignablesSinPrecio === 1 ? "" : "s"} del catálogo
              de consignación {consignablesSinPrecio === 1 ? "no tiene" : "no tienen"} precio
              cargado (aparecen con el badge “Sin precio”). Corrige el precio en TERAVINO Flow, o
              captúralo manualmente en el renglón al agregarlo.
            </p>
          )}

          {/* Items */}
          {items.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right w-24">Cantidad</th>
                    <th className="px-3 py-2 text-right w-32">Precio unit.</th>
                    <th className="px-3 py-2 text-right w-32">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const sub = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
                    const precioInvalido = !(Number(it.precio_unitario) > 0);
                    return (
                      <tr key={it.key} className="border-t">
                        <td className="px-3 py-2">{it.producto_nombre}</td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={it.cantidad}
                            onChange={(e) => updateItem(it.key, { cantidad: Number(e.target.value) })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={it.precio_unitario}
                            onChange={(e) =>
                              updateItem(it.key, { precio_unitario: Number(e.target.value) })
                            }
                            aria-invalid={precioInvalido}
                            className={
                              precioInvalido
                                ? "h-8 text-right border-destructive focus-visible:ring-destructive"
                                : "h-8 text-right"
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                          {formatCurrency(sub)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(it.key)}
                            aria-label="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={3} className="px-3 py-2 text-right font-medium">Total</td>
                    <td className="px-3 py-2 text-right font-display text-lg">{formatCurrency(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {items.length > 0 && hasPrecioCero && (
            <p className="text-sm text-destructive" role="alert">
              Cada producto debe tener un precio unitario mayor a $0.00 — corrige los renglones
              marcados para poder crear la consignación.
            </p>
          )}

          {/* Add product */}
          <div className="space-y-2">
            <Label>Agregar producto</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, bodega, código SKU..."
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            {productQuery && (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {filteredProductos.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">Sin resultados.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {filteredProductos.map((p) => {
                      const sinPrecio = !(Number(p.precio_unitario) > 0);
                      const sinStock = p.stock != null && Number(p.stock) <= 0;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => addProduct(p)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="font-medium">{p.nombre}</p>
                                {sinPrecio && <Badge variant="danger">Sin precio</Badge>}
                                {sinStock && <Badge variant="warning">Sin stock</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {p.bodega ?? "—"}
                                {p.codigo ? ` · SKU ${p.codigo}` : ""}
                                {p.tipo ? ` · ${p.tipo}` : ""}
                              </p>
                            </div>
                            <div className="text-right text-xs">
                              <p className={sinPrecio ? "font-medium text-destructive" : "font-medium"}>
                                {formatCurrency(p.precio_unitario)}
                              </p>
                              <p className="text-muted-foreground">
                                {p.stock != null ? `stock ${p.stock}` : ""}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-6">
          <Label htmlFor="notas">Notas</Label>
          <Textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional — condiciones, contacto en sitio, etc."
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => history.back()} disabled={pending}>
          Cancelar
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Total: <strong>{formatCurrency(total)}</strong></span>
          <Button onClick={submit} disabled={pending || !canSubmit}>
            <Plus className="mr-1 h-4 w-4" />
            {pending ? "Creando…" : "Crear consignación"}
          </Button>
        </div>
      </div>
    </div>
  );
}
