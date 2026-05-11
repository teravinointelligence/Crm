"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_METHODS } from "@/types/database";

export function SupplierPaymentDialog({
  poId, poNumber, repId, balance,
}: {
  poId: string; poNumber: string; repId: string; balance: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount") ?? 0);
    if (!amount || amount <= 0) { toast.error("Monto inválido"); return; }
    startTransition(async () => {
      const { error } = await supabase.rpc("register_supplier_payment", {
        p_po_id: poId,
        p_amount: amount,
        p_payment_date: String(fd.get("date") ?? today),
        p_method: (fd.get("method") as string) || "transferencia",
        p_reference: (fd.get("ref") as string) || null,
        p_notes: (fd.get("notes") as string) || null,
        p_paid_by: repId,
      });
      if (error) { toast.error("No pudimos registrar el pago", { description: error.message }); return; }
      toast.success("Pago al proveedor registrado");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Registrar pago</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Pago a proveedor — {poNumber}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="amount">Monto * (saldo {balance.toLocaleString("es-MX", { style: "currency", currency: "MXN" })})</Label><Input id="amount" name="amount" type="number" step="0.01" min={0} defaultValue={balance > 0 ? balance : undefined} required /></div>
          <div className="space-y-1.5"><Label htmlFor="date">Fecha *</Label><Input id="date" name="date" type="date" defaultValue={today} required /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="method">Método</Label>
              <Select name="method" defaultValue="transferencia"><SelectTrigger id="method"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ref">Referencia</Label><Input id="ref" name="ref" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
