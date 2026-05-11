"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { PRODUCT_CATEGORIES, type Product } from "@/types/database";

const KNOWN_SUPPLIERS = [
  "Vernazza",
  "Bruma",
  "Vinaltura",
  "Brewwines",
  "Lechuza",
  "Wendlandt",
  "Discográfica Vinícola",
  "Finca La Carrodilla",
  "Philipponnat",
  "Habla",
  "La Crema",
];

export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      sku: (fd.get("sku") as string) || null,
      name: String(fd.get("name") ?? "").trim(),
      supplier: String(fd.get("supplier") ?? "").trim(),
      category: (fd.get("category") as string) || null,
      varietal: (fd.get("varietal") as string) || null,
      country: (fd.get("country") as string) || null,
      region_origin: (fd.get("region_origin") as string) || null,
      vintage: (fd.get("vintage") as string) || null,
      volume_ml: Number(fd.get("volume_ml") ?? 750),
      base_price: Number(fd.get("base_price") ?? 0),
      stock_quantity: Number(fd.get("stock_quantity") ?? 0),
      stock_min_alert: Number(fd.get("stock_min_alert") ?? 6),
      active: fd.get("active") !== "off",
      notes: (fd.get("notes") as string) || null,
    };
    if (!payload.name || !payload.supplier || payload.base_price <= 0) {
      toast.error("Nombre, proveedor y precio son obligatorios");
      return;
    }
    startTransition(async () => {
      const { data, error } = product
        ? await supabase
            .from("products")
            .update(payload)
            .eq("id", product.id)
            .select("id")
            .single()
        : await supabase
            .from("products")
            .insert(payload)
            .select("id")
            .single();
      if (error) {
        toast.error("No pudimos guardar el producto", {
          description: error.message,
        });
        return;
      }
      toast.success(product ? "Producto actualizado" : "Producto creado");
      router.push(`/catalogo/${data!.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={product?.name}
          placeholder="Vernazza Nebbiolo Reserva"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="supplier">Proveedor *</Label>
        <Input
          id="supplier"
          name="supplier"
          required
          defaultValue={product?.supplier}
          list="suppliers"
        />
        <datalist id="suppliers">
          {KNOWN_SUPPLIERS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Categoría</Label>
        <Select name="category" defaultValue={product?.category ?? undefined}>
          <SelectTrigger id="category">
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="varietal">Varietal</Label>
        <Input
          id="varietal"
          name="varietal"
          defaultValue={product?.varietal ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="country">País</Label>
        <Input
          id="country"
          name="country"
          defaultValue={product?.country ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="region_origin">Región de origen</Label>
        <Input
          id="region_origin"
          name="region_origin"
          defaultValue={product?.region_origin ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vintage">Añada</Label>
        <Input
          id="vintage"
          name="vintage"
          defaultValue={product?.vintage ?? ""}
          placeholder="2020"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="volume_ml">Volumen (ml)</Label>
        <Input
          id="volume_ml"
          name="volume_ml"
          type="number"
          min={0}
          defaultValue={product?.volume_ml ?? 750}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="base_price">Precio base (Cabos / PV / Nay / TS) *</Label>
        <Input
          id="base_price"
          name="base_price"
          type="number"
          step="0.01"
          min={0}
          required
          defaultValue={product?.base_price ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="stock_quantity">Stock actual</Label>
        <Input
          id="stock_quantity"
          name="stock_quantity"
          type="number"
          step="0.01"
          defaultValue={product?.stock_quantity ?? 0}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="stock_min_alert">Umbral de alerta</Label>
        <Input
          id="stock_min_alert"
          name="stock_min_alert"
          type="number"
          step="0.01"
          defaultValue={product?.stock_min_alert ?? 6}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active !== false}
          className="h-4 w-4 rounded border-input"
        />
        Activo (aparece en cotizaciones)
      </label>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" defaultValue={product?.notes ?? ""} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
