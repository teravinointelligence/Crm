"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PROMO_TYPE_LABELS: Record<string, string> = {
  descuento: "Descuento %",
  bonificacion: "Promoción",
  paquete: "Paquete / Bundle",
  temporada: "Temporada",
  otro: "Otro",
};

export type PromoRow = {
  id: string;
  title: string;
  product_id: string | null;
  product_name: string | null;
  promo_type: string;
  description: string | null;
  discount_pct: number | null;
  bonus_qty: number | null;
  bonus_per: number | null;
  valid_from: string | null;
  valid_to: string | null;
  active: boolean;
  created_at: string;
  participantes?: string[];
};

type Product = { id: string; name: string; supplier: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  products: Product[];
  repId: string;
  initial?: PromoRow | null;
};

export function PromocionForm({ open, onClose, products, repId, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [productId, setProductId] = useState(initial?.product_id ?? "__general__");
  const [promoType, setPromoType] = useState(initial?.promo_type ?? "otro");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [discountPct, setDiscountPct] = useState(String(initial?.discount_pct ?? ""));
  const [bonusQty, setBonusQty] = useState(String(initial?.bonus_qty ?? ""));
  const [bonusPer, setBonusPer] = useState(String(initial?.bonus_per ?? ""));
  const [validFrom, setValidFrom] = useState(initial?.valid_from ?? "");
  const [validTo, setValidTo] = useState(initial?.valid_to ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [participantes, setParticipantes] = useState<Set<string>>(
    new Set(initial?.participantes ?? []),
  );
  const [prodQuery, setProdQuery] = useState("");

  const filteredProducts = useMemo(() => {
    const q = prodQuery.trim().toLowerCase();
    const base = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.supplier ?? "").toLowerCase().includes(q),
        )
      : products;
    // Los seleccionados van primero para poder revisarlos/quitarlos al editar.
    const sel = base.filter((p) => participantes.has(p.id));
    const rest = base.filter((p) => !participantes.has(p.id));
    return [...sel, ...rest].slice(0, 60);
  }, [products, prodQuery, participantes]);

  function toggleParticipante(id: string) {
    setParticipantes((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setTitle(initial?.title ?? "");
    setProductId(initial?.product_id ?? "__general__");
    setPromoType(initial?.promo_type ?? "otro");
    setDescription(initial?.description ?? "");
    setDiscountPct(String(initial?.discount_pct ?? ""));
    setBonusQty(String(initial?.bonus_qty ?? ""));
    setBonusPer(String(initial?.bonus_per ?? ""));
    setValidFrom(initial?.valid_from ?? "");
    setValidTo(initial?.valid_to ?? "");
    setActive(initial?.active ?? true);
    setParticipantes(new Set(initial?.participantes ?? []));
    setProdQuery("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function submit() {
    if (!title.trim() || !promoType) {
      toast.error("El nombre y el tipo de promoción son obligatorios");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const payload = {
        title: title.trim(),
        product_id: productId === "__general__" ? null : productId,
        promo_type: promoType,
        description: description.trim() || null,
        discount_pct: discountPct !== "" ? Number(discountPct) : null,
        bonus_qty: bonusQty !== "" ? Number(bonusQty) : null,
        bonus_per: bonusPer !== "" ? Number(bonusPer) : null,
        valid_from: validFrom || null,
        valid_to: validTo || null,
        active,
        created_by: repId,
      };

      let error;
      let promoId = initial?.id ?? null;
      if (initial) {
        ({ error } = await supabase.from("promotions").update(payload).eq("id", initial.id));
      } else {
        const ins = await supabase.from("promotions").insert(payload).select("id").single();
        error = ins.error;
        promoId = ins.data?.id ?? null;
      }

      if (error) {
        toast.error("Error al guardar la promoción", { description: error.message });
        return;
      }

      // Sincroniza productos participantes (para el filtro "compradores de la
      // promo" en el envío): borra los actuales y reinserta la selección.
      if (promoId) {
        const ids = Array.from(participantes);
        await supabase.from("promotion_products").delete().eq("promotion_id", promoId);
        if (ids.length) {
          const { error: ppErr } = await supabase
            .from("promotion_products")
            .insert(ids.map((product_id) => ({ promotion_id: promoId as string, product_id })));
          if (ppErr) {
            toast.error("La promo se guardó, pero falló guardar los productos participantes", {
              description: ppErr.message,
            });
          }
        }
      }

      toast.success(initial ? "Promoción actualizada" : "Promoción creada");
      handleClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-title">Nombre / anuncio *</Label>
            <Input
              id="p-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ej. Verano 2026 — 20% off Chablis"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={promoType} onValueChange={setPromoType}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROMO_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Vino / producto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los vinos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general__">— General (todos los vinos)</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.supplier ? ` · ${p.supplier}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Descripción / condiciones</Label>
            <Textarea
              id="p-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles de la promoción, restricciones, contacto del proveedor…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Productos participantes{" "}
              <span className="font-normal text-muted-foreground">
                (opcional — habilita el filtro “compradores de la promo” al enviar)
              </span>
            </Label>
            <Input
              placeholder="Buscar vino o proveedor para agregar…"
              value={prodQuery}
              onChange={(e) => setProdQuery(e.target.value)}
            />
            {participantes.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {participantes.size} producto{participantes.size === 1 ? "" : "s"} seleccionado
                {participantes.size === 1 ? "" : "s"}
              </p>
            )}
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
              {filteredProducts.length === 0 && (
                <li className="px-1 py-2 text-center text-xs text-muted-foreground">
                  Sin coincidencias.
                </li>
              )}
              {filteredProducts.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-carmesi"
                      checked={participantes.has(p.id)}
                      onChange={() => toggleParticipante(p.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      {p.supplier ? (
                        <span className="text-muted-foreground"> · {p.supplier}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {/* Campos según tipo */}
          {promoType === "descuento" && (
            <div className="space-y-1.5">
              <Label htmlFor="p-disc">Descuento (%)</Label>
              <Input
                id="p-disc"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                placeholder="ej. 20"
              />
            </div>
          )}

          {promoType === "bonificacion" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-per">Por cada X unidades</Label>
                <Input
                  id="p-per"
                  type="number"
                  min={1}
                  step={1}
                  value={bonusPer}
                  onChange={(e) => setBonusPer(e.target.value)}
                  placeholder="ej. 6"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-qty">Llevan Y de bonificación</Label>
                <Input
                  id="p-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={bonusQty}
                  onChange={(e) => setBonusQty(e.target.value)}
                  placeholder="ej. 1"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-from">Vigencia desde</Label>
              <Input
                id="p-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-to">Vigencia hasta</Label>
              <Input
                id="p-to"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>

          {initial && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Promoción activa
            </label>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={handleClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !title.trim()}>
              {pending ? "Guardando…" : initial ? "Guardar cambios" : "Crear promoción"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
