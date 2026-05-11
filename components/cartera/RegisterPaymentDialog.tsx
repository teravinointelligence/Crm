"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/types/database";

type OpenInvoice = { id: string; invoice_number: string; balance: number | null };

export function RegisterPaymentDialog({
  accountId,
  openInvoices,
}: {
  accountId: string;
  openInvoices: OpenInvoice[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [invoiceId, setInvoiceId] = useState<string>("__fifo");

  const today = new Date().toISOString().slice(0, 10);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount") ?? 0);
    if (!amount || amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.rpc("apply_payment", {
        p_account_id: accountId,
        p_amount: amount,
        p_payment_date: String(fd.get("payment_date") ?? today),
        p_method: (fd.get("method") as string) || "transferencia",
        p_reference: (fd.get("reference") as string) || null,
        p_notes: (fd.get("notes") as string) || null,
        p_invoice_id: invoiceId === "__fifo" ? null : invoiceId,
      });
      if (error) {
        toast.error("No pudimos registrar el pago", {
          description: error.message,
        });
        return;
      }
      toast.success("Pago registrado");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> Registrar pago
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Monto *</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min={0} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment_date">Fecha *</Label>
            <Input
              id="payment_date"
              name="payment_date"
              type="date"
              defaultValue={today}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Aplicar a</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__fifo">
                  Repartir entre facturas (más antiguas primero)
                </SelectItem>
                {openInvoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoice_number} — saldo {formatCurrency(i.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="method">Método</Label>
              <Select name="method" defaultValue="transferencia">
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference">Referencia</Label>
              <Input id="reference" name="reference" placeholder="# transferencia / cheque" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
