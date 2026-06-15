"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search, Trash2, ArrowRightLeft, Wine, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { applyRegionPrice } from "@/lib/pricing";
import type { Product } from "@/types/database";

type WineRow = {
  id: string;
  product_id: string;
  status: "muestra" | "encartado" | "descartado";
  notes: string | null;
  since: string | null;
  created_at: string | null;
  products: {
    id: string;
    name: string;
    supplier: string;
    varietal: string | null;
    vintage: string | null;
    base_price: number;
    active: boolean | null;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  muestra: "Muestra / probado",
  encartado: "Encartado",
  descartado: "Descartado",
};

export function AccountWines({
  accountId,
  priceTier,
  repId,
  wines,
  products,
}: {
  accountId: string;
  priceTier: "base" | "+10";
  repId: string;
  wines: WineRow[];
  products: Pick<Product, "id" | "name" | "supplier" | "varietal" | "vintage" | "base_price" | "active">[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<"muestra" | "encartado">("muestra");
  const [proposing, setProposing] = useState(false);
  const [newWine, setNewWine] = useState({ name: "", supplier: "", varietal: "", vintage: "" });

  const existingIds = useMemo(() => new Set(wines.map((w) => w.product_id)), [wines]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = products.filter((p) => p.active !== false && !existingIds.has(p.id));
    if (!q) return base.slice(0, 8);
    return base
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.supplier.toLowerCase().includes(q) ||
          (p.varietal ?? "").toLowerCase().includes(q),
      )
      .slice(0, 14);
  }, [products, query, existingIds]);

  const add = (productId: string) => {
    startTransition(async () => {
      const { error } = await supabase.from("account_products").insert({
        account_id: accountId,
        product_id: productId,
        status: defaultStatus,
        added_by: repId,
        since: defaultStatus === "encartado" ? new Date().toISOString().slice(0, 10) : null,
      });
      if (error) {
        toast.error("No se pudo agregar", { description: error.message });
        return;
      }
      toast.success("Vino agregado");
      setQuery("");
      router.refresh();
    });
  };

  const propose = () => {
    const name = newWine.name.trim();
    const supplier = newWine.supplier.trim();
    if (!name || !supplier) {
      toast.error("Nombre y proveedor son obligatorios");
      return;
    }
    startTransition(async () => {
      // Producto propuesto: inactivo (no entra a cotizaciones) hasta que admin lo revise.
      const { data: created, error: prodErr } = await supabase
        .from("products")
        .insert({
          name,
          supplier,
          varietal: newWine.varietal.trim() || null,
          vintage: newWine.vintage.trim() || null,
          base_price: 0,
          active: false,
          proposed_by: repId,
          proposed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (prodErr || !created) {
        toast.error("No se pudo proponer el vino", { description: prodErr?.message });
        return;
      }
      const { error: linkErr } = await supabase.from("account_products").insert({
        account_id: accountId,
        product_id: created.id,
        status: defaultStatus,
        added_by: repId,
        since: defaultStatus === "encartado" ? new Date().toISOString().slice(0, 10) : null,
      });
      if (linkErr) {
        toast.error("Vino creado pero no se pudo agregar a la cuenta", { description: linkErr.message });
        return;
      }
      toast.success("Vino propuesto y agregado", {
        description: "Quedó marcado como «propuesto» para que admin lo revise y le ponga precio.",
      });
      setNewWine({ name: "", supplier: "", varietal: "", vintage: "" });
      setProposing(false);
      setQuery("");
      setOpen(false);
      router.refresh();
    });
  };

  const setStatus = (id: string, status: "muestra" | "encartado" | "descartado") => {
    startTransition(async () => {
      const { error } = await supabase
        .from("account_products")
        .update({ status, since: status === "encartado" ? new Date().toISOString().slice(0, 10) : null })
        .eq("id", id);
      if (error) {
        toast.error("No se pudo actualizar", { description: error.message });
        return;
      }
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const { error } = await supabase.from("account_products").delete().eq("id", id);
      if (error) {
        toast.error("No se pudo quitar", { description: error.message });
        return;
      }
      router.refresh();
    });
  };

  const encartados = wines.filter((w) => w.status === "encartado");
  const muestras = wines.filter((w) => w.status === "muestra");
  const descartados = wines.filter((w) => w.status === "descartado");

  const renderRow = (w: WineRow) => (
    <tr key={w.id} className="border-b last:border-b-0">
      <td className="px-3 py-2">
        {w.products ? (
          <span className="inline-flex items-center gap-1.5">
            <Link href={`/catalogo/${w.products.id}`} className="font-medium hover:text-brand-carmesi">
              {w.products.name}
            </Link>
            {w.products.active === false && (
              <Badge variant="muted" title="Vino propuesto por un vendedor, pendiente de revisión por admin">
                propuesto
              </Badge>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">producto eliminado</span>
        )}
        <div className="text-xs text-muted-foreground">
          {[w.products?.supplier, w.products?.varietal, w.products?.vintage].filter(Boolean).join(" · ")}
          {w.since ? ` · desde ${formatDate(w.since)}` : ""}
        </div>
        {w.notes && <div className="text-xs text-muted-foreground italic">{w.notes}</div>}
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground">
        {w.products ? formatCurrency(applyRegionPrice(w.products.base_price, priceTier)) : "—"}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {w.status !== "encartado" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus(w.id, "encartado")} title="Marcar encartado">
            <Wine className="mr-1 h-3.5 w-3.5" /> Encartar
          </Button>
        )}
        {w.status !== "muestra" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus(w.id, "muestra")} title="Mover a muestras">
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> A muestras
          </Button>
        )}
        {w.status !== "descartado" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus(w.id, "descartado")} title="Descartar">
            Descartar
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-red-600" disabled={pending} onClick={() => remove(w.id)} title="Quitar">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );

  const section = (title: string, icon: React.ReactNode, list: WineRow[], emptyText: string) => (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {icon}
          <h3 className="font-display text-lg">{title}</h3>
          <Badge variant="muted">{list.length}</Badge>
        </div>
        {list.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Vino</th>
                <th className="px-3 py-2 text-right">Precio cliente</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>{list.map(renderRow)}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Vinos que esta cuenta tiene en su lista (encartados) y los que ha probado en muestras.
        </p>
        <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/muestras/nueva?account=${accountId}`}>
            <FlaskConical className="mr-1 h-4 w-4" /> Solicitar muestras
          </Link>
        </Button>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setProposing(false);
              setNewWine({ name: "", supplier: "", varietal: "", vintage: "" });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Agregar vino
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{proposing ? "Proponer vino nuevo" : "Agregar vino a la cuenta"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant={defaultStatus === "muestra" ? "default" : "outline"} onClick={() => setDefaultStatus("muestra")}>
                  <FlaskConical className="mr-1 h-3.5 w-3.5" /> Muestra / probado
                </Button>
                <Button size="sm" variant={defaultStatus === "encartado" ? "default" : "outline"} onClick={() => setDefaultStatus("encartado")}>
                  <Wine className="mr-1 h-3.5 w-3.5" /> Encartado
                </Button>
              </div>

              {proposing ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Crea un vino que no está en el catálogo. Quedará marcado como «propuesto» (sin precio)
                    para que admin lo revise, le ponga precio y lo active.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-name">Nombre del vino *</Label>
                    <Input
                      id="np-name"
                      value={newWine.name}
                      onChange={(e) => setNewWine((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Vernazza Nebbiolo Reserva"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-supplier">Proveedor / bodega *</Label>
                    <Input
                      id="np-supplier"
                      value={newWine.supplier}
                      onChange={(e) => setNewWine((s) => ({ ...s, supplier: e.target.value }))}
                      placeholder="Vernazza"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="np-varietal">Varietal</Label>
                      <Input
                        id="np-varietal"
                        value={newWine.varietal}
                        onChange={(e) => setNewWine((s) => ({ ...s, varietal: e.target.value }))}
                        placeholder="Nebbiolo"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="np-vintage">Añada</Label>
                      <Input
                        id="np-vintage"
                        value={newWine.vintage}
                        onChange={(e) => setNewWine((s) => ({ ...s, vintage: e.target.value }))}
                        placeholder="2020"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 pt-1">
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setProposing(false)}>
                      ← Volver a buscar
                    </Button>
                    <Button size="sm" disabled={pending} onClick={propose}>
                      {pending ? "Guardando…" : "Proponer y agregar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar vino del catálogo…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" autoFocus />
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {matches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin coincidencias (o ya están agregados).</p>
                    ) : (
                      matches.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={pending}
                          onClick={() => add(p.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-md border bg-card p-2 text-left text-sm hover:border-brand-carmesi disabled:opacity-50"
                        >
                          <span>
                            <span className="font-medium">{p.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[p.supplier, p.varietal, p.vintage].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(applyRegionPrice(p.base_price, priceTier))}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="rounded-md border border-dashed p-2 text-sm">
                    <p className="mb-2 text-muted-foreground">¿No encuentras el vino en el catálogo?</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setProposing(true);
                        // Precarga el texto buscado como nombre tentativo.
                        setNewWine((s) => ({ ...s, name: s.name || query.trim() }));
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Proponer vino nuevo
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {wines.length === 0 ? (
        <EmptyState
          icon={Wine}
          title="Aún sin vinos registrados"
          description="Agrega los vinos que la cuenta ya compra (encartados) o los que ha probado en muestras."
        />
      ) : (
        <div className="space-y-4">
          {section("Encartados — nos compran", <Wine className="h-5 w-5 text-brand-carmesi" />, encartados, "Marca un vino como «encartado» cuando entre a su lista.")}
          {section("Muestras / probados", <FlaskConical className="h-5 w-5 text-brand-carmesi" />, muestras, "Sin muestras registradas.")}
          {descartados.length > 0 && section("Descartados", <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />, descartados, "")}
        </div>
      )}
    </div>
  );
}
