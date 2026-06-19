"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical, PackageCheck, PackagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { AccountCombobox } from "@/components/accounts/AccountCombobox";
import { SAMPLE_LOCATIONS } from "@/lib/samples";
import { formatDate } from "@/lib/utils";

export type BankRow = {
  product_id: string;
  product_name: string;
  supplier: string | null;
  region: string | null;
  location: string | null;
  available: number;
  ingresado: number;
  tomado: number;
};

export type RegionMetrics = { usadas: number; encartadas: number };
export type LastUse = { rep: string | null; account: string | null; date: string | null; note: string | null };

type AccountOption = { id: string; business_name: string; region?: string | null };

const NONE = "__none";
const UNSET = "__unset";

export function SampleBankClient({
  rows,
  isAdmin,
  accounts,
  metricsByRegion,
  lastUse = {},
}: {
  rows: BankRow[];
  isAdmin: boolean;
  accounts: AccountOption[];
  metricsByRegion: Record<string, RegionMetrics>;
  // key `${product_id}|${region ?? "Sin zona"}` → último uso
  lastUse?: Record<string, LastUse>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [take, setTake] = useState<BankRow | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState<string>(NONE);
  const [release, setRelease] = useState<BankRow | null>(null);
  const [relQty, setRelQty] = useState(1);
  const [relNote, setRelNote] = useState("");

  const openTake = (r: BankRow) => {
    setTake(r);
    setQty(1);
    setNote("");
    setAccountId(NONE);
  };

  const openRelease = (r: BankRow) => {
    setRelease(r);
    setRelQty(1);
    setRelNote("");
  };

  const confirmRelease = () => {
    if (!release) return;
    if (relQty <= 0) {
      toast.error("Cantidad inválida");
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.rpc("sample_bank_release", {
        p_product: release.product_id,
        p_region: release.region,
        p_qty: relQty,
        p_location: release.location,
        p_note: relNote || null,
      });
      if (error) {
        toast.error("No se pudo liberar", { description: error.message });
        return;
      }
      toast.success(`Liberaste ${relQty} × ${release.product_name}`);
      setRelease(null);
      router.refresh();
    });
  };

  const confirmTake = () => {
    if (!take) return;
    if (qty <= 0 || qty > take.available) {
      toast.error("Cantidad inválida");
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.rpc("sample_bank_take", {
        p_product: take.product_id,
        p_region: take.region,
        p_qty: qty,
        p_note: note || null,
        p_location: take.location,
        p_account: accountId === NONE ? null : accountId,
      });
      if (error) {
        toast.error("No se pudo tomar la muestra", { description: error.message });
        return;
      }
      toast.success(`Tomaste ${qty} × ${take.product_name}`);
      setTake(null);
      router.refresh();
    });
  };

  const setLocation = (r: BankRow, to: string | null) => {
    startTransition(async () => {
      const { error } = await supabase.rpc("sample_bank_set_location", {
        p_product: r.product_id,
        p_region: r.region,
        p_from_location: r.location,
        p_to_location: to,
      });
      if (error) {
        toast.error("No se pudo cambiar la bodega", { description: error.message });
        return;
      }
      toast.success(to ? `Movido a ${to}` : "Bodega quitada");
      router.refresh();
    });
  };

  if (!rows.length) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Banco vacío"
        description={
          isAdmin
            ? "Cuando autorices (apruebes) una solicitud de muestras, sus botellas aparecerán aquí, en la zona del vendedor."
            : "Por ahora no hay muestras disponibles en tu zona."
        }
      />
    );
  }

  const byRegion = new Map<string, BankRow[]>();
  for (const r of rows) {
    const key = r.region ?? "Sin zona";
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key)!.push(r);
  }

  return (
    <div className="space-y-6">
      {[...byRegion.entries()].map(([region, list]) => {
        const m = metricsByRegion[region];
        return (
        <Card key={region}>
          <CardContent className="p-0">
            {isAdmin && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm">
                <span className="font-medium">Zona: {region}</span>
                {m && m.usadas > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Usadas: <strong className="text-foreground">{m.usadas}</strong> · Encartadas:{" "}
                    <strong className="text-foreground">{m.encartadas}</strong> · % encartes:{" "}
                    <strong className="text-foreground">{Math.round((m.encartadas / m.usadas) * 100)}%</strong>
                  </span>
                )}
              </div>
            )}
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Vino</th>
                  <th className="px-4 py-3">Bodega (vino)</th>
                  <th className="px-4 py-3">Ubicación</th>
                  <th className="px-4 py-3 text-right">Disponibles</th>
                  <th className="px-4 py-3">Último uso</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={`${r.product_id}-${r.region ?? "none"}-${r.location ?? "none"}`} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{r.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.supplier ?? "—"}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <Select
                          value={r.location ?? UNSET}
                          onValueChange={(v) => setLocation(r, v === UNSET ? null : v)}
                        >
                          <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNSET}>Sin asignar</SelectItem>
                            {SAMPLE_LOCATIONS.map((loc) => (
                              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        r.location ?? <span className="text-muted-foreground">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="success">{r.available}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const u = lastUse[`${r.product_id}|${r.region ?? "Sin zona"}`];
                        if (!u) return <span className="text-xs text-muted-foreground">Sin registro</span>;
                        return (
                          <div className="text-xs leading-tight">
                            <div className="font-medium">{u.rep ?? "—"}</div>
                            <div className="text-muted-foreground">
                              {u.account ? `→ ${u.account}` : "sin cliente"}
                              {u.date ? ` · ${formatDate(u.date)}` : ""}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => openRelease(r)} disabled={pending}>
                            <PackagePlus className="mr-1 h-4 w-4" /> Liberar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openTake(r)} disabled={pending}>
                          <PackageCheck className="mr-1 h-4 w-4" /> Tomar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        );
      })}

      <Dialog open={!!take} onOpenChange={(o) => !o && setTake(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tomar muestra</DialogTitle>
          </DialogHeader>
          {take && (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-medium">{take.product_name}</div>
                <div className="text-muted-foreground">
                  {[take.supplier, take.region ?? "Sin zona", take.location ?? "Sin bodega", `${take.available} disponibles`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank_qty">Cantidad</Label>
                <Input
                  id="bank_qty"
                  type="number"
                  min={1}
                  max={take.available}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente (para medir encartes)</Label>
                <AccountCombobox
                  accounts={accounts}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder="¿Para qué cliente?"
                  noneValue={NONE}
                  noneLabel="— Sin cliente específico —"
                />
                <p className="text-xs text-muted-foreground">Si luego encartas el vino en su lista, contará como encarte.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank_note">Nota (cata / cita)</Label>
                <Input
                  id="bank_note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Cata en…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTake(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={confirmTake} disabled={pending}>
                  {pending ? "Tomando…" : "Tomar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!release} onOpenChange={(o) => !o && setRelease(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar botellas</DialogTitle>
          </DialogHeader>
          {release && (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-medium">{release.product_name}</div>
                <div className="text-muted-foreground">
                  {[release.supplier, release.region ?? "Sin zona", release.location ?? "Sin bodega", `${release.available} disponibles`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Repone botellas a este vino en su zona y bodega para que los vendedores puedan volver a tomarlas.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="rel_qty">Cantidad a liberar</Label>
                <Input
                  id="rel_qty"
                  type="number"
                  min={1}
                  value={relQty}
                  onChange={(e) => setRelQty(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rel_note">Nota (motivo)</Label>
                <Input
                  id="rel_note"
                  value={relNote}
                  onChange={(e) => setRelNote(e.target.value)}
                  placeholder="Reposición / botellas devueltas…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRelease(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={confirmRelease} disabled={pending}>
                  {pending ? "Liberando…" : "Liberar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
