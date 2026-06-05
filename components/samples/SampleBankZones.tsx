"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { AccountCombobox } from "@/components/accounts/AccountCombobox";
import { createClient } from "@/lib/supabase/client";
import { SAMPLE_LOCATIONS } from "@/lib/samples";

export type StockRow = {
  productId: string;
  productName: string;
  supplier: string | null;
  region: string | null;
  location: string | null;
  available: number;
};

export type Zone = {
  region: string;
  rows: StockRow[];
  usadas: number;
  encartadas: number;
};

type AccountOption = { id: string; business_name: string; region?: string | null };

const NONE = "__none";
const UNSET = "__unset";

export function SampleBankZones({
  zones,
  accounts,
  repId,
  isAdmin,
}: {
  zones: Zone[];
  accounts: AccountOption[];
  repId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  // Tomar
  const [taking, setTaking] = useState<StockRow | null>(null);
  const [qty, setQty] = useState(1);
  const [accountId, setAccountId] = useState<string>(NONE);
  const [takeNotes, setTakeNotes] = useState("");

  const openTake = (row: StockRow) => {
    setTaking(row);
    setQty(1);
    setAccountId(NONE);
    setTakeNotes("");
  };

  const confirmTake = () => {
    if (!taking) return;
    if (qty <= 0 || qty > taking.available) {
      toast.error(`Cantidad inválida (disponibles: ${taking.available})`);
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.from("sample_bank_movements").insert({
        product_id: taking.productId,
        product_name: taking.productName,
        supplier: taking.supplier,
        region: taking.region,
        location: taking.location,
        quantity: qty,
        kind: "salida",
        account_id: accountId === NONE ? null : accountId,
        taken_by: repId,
        created_by: repId,
        notes: takeNotes || null,
      });
      if (error) { toast.error("No se pudo registrar la toma", { description: error.message }); return; }
      toast.success(`Tomaste ${qty} × ${taking.productName}`);
      setTaking(null);
      router.refresh();
    });
  };

  const setLocation = (row: StockRow, location: string | null) => {
    startTransition(async () => {
      let q = supabase.from("sample_bank_movements").update({ location }).eq("product_id", row.productId);
      q = row.region == null ? q.is("region", null) : q.eq("region", row.region);
      const { error } = await q;
      if (error) { toast.error("No se pudo cambiar la ubicación", { description: error.message }); return; }
      toast.success(location ? `Movido a ${location}` : "Ubicación quitada");
      router.refresh();
    });
  };

  return (
    <>
      <div className="space-y-6">
        {zones.map((z) => (
          <Card key={z.region} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
              <h3 className="font-display text-lg">Zona: {z.region}</h3>
              <p className="text-xs text-muted-foreground">
                Usadas: <strong className="text-foreground">{z.usadas}</strong> · Encartadas:{" "}
                <strong className="text-foreground">{z.encartadas}</strong> · % encartes:{" "}
                <strong className="text-foreground">{z.usadas ? Math.round((z.encartadas / z.usadas) * 100) : 0}%</strong>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Vino</th>
                    <th className="px-4 py-3">Bodega</th>
                    <th className="px-4 py-3">Ubicación</th>
                    <th className="px-4 py-3 text-center">Disponibles</th>
                    {isAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {z.rows.map((row) => (
                    <tr key={`${row.productId}:${row.region}`} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{row.productName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.supplier ?? "—"}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <Select
                            value={row.location ?? UNSET}
                            onValueChange={(v) => setLocation(row, v === UNSET ? null : v)}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue placeholder="Sin asignar" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNSET}>Sin asignar</SelectItem>
                              {SAMPLE_LOCATIONS.map((loc) => (
                                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          row.location ?? <span className="text-muted-foreground">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={row.available > 0 ? "success" : "muted"}>{row.available}</Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" disabled={pending || row.available <= 0} onClick={() => openTake(row)}>
                            <PackageOpen className="mr-1 h-4 w-4" /> Tomar
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!taking} onOpenChange={(o) => !o && setTaking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-brand-carmesi" /> Tomar muestra
            </DialogTitle>
            <DialogDescription>
              {taking ? `${taking.productName}${taking.supplier ? ` · ${taking.supplier}` : ""} · ${taking.region}${taking.location ? ` · ${taking.location}` : ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="take-qty">Botellas a tomar</Label>
              <Input
                id="take-qty"
                type="number"
                min={1}
                max={taking?.available ?? 1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Disponibles: {taking?.available ?? 0}</p>
            </div>
            <div className="space-y-2">
              <Label>Cliente (para medir encartes)</Label>
              <AccountCombobox
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                placeholder="¿Para qué cliente?"
                noneValue={NONE}
                noneLabel="— Sin cliente específico —"
              />
              <p className="text-xs text-muted-foreground">
                Si asignas un cliente y luego encartas el vino en su lista, contará como encarte.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="take-notes">Nota (opcional)</Label>
              <Textarea id="take-notes" value={takeNotes} onChange={(e) => setTakeNotes(e.target.value)} placeholder="Cata, evento, quién la lleva…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaking(null)} disabled={pending}>Cancelar</Button>
            <Button onClick={confirmTake} disabled={pending}>{pending ? "Guardando…" : "Confirmar toma"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
