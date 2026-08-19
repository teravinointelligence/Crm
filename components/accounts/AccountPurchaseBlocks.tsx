"use client";

// "No puede comprar": periodos en que la cuenta tiene prohibido hacer pedidos.
//
// Existe porque hay cuentas —hoteles sobre todo— a las que en temporada baja
// corporativo no les autoriza compras. Sin esto, el CRM las trataba igual que a
// un cliente que se está perdiendo: le mandaba al vendedor la alerta de "lleva
// un mes sin facturar" mes con mes, y el vendedor aprendía a ignorar el correo.
//
// Escribe directo con el cliente RLS (como AccountProposals): la política de
// account_purchase_blocks ya deja solo al admin y al vendedor de la cuenta.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOCK_REASONS,
  BLOCK_REASON_LABEL,
  activeBlockOn,
  compareBlocks,
  isBlockActiveOn,
  type PurchaseBlock,
  type PurchaseBlockReason,
} from "@/lib/purchase-blocks";
import { formatDate } from "@/lib/utils";

export function AccountPurchaseBlocks({
  accountId,
  repId,
  today,
  blocks: initial,
  canEdit,
}: {
  accountId: string;
  repId: string;
  /** Día de hoy (`YYYY-MM-DD`) en hora de Los Cabos, calculado en el servidor
   *  para que la vigencia no dependa del reloj del celular del vendedor. */
  today: string;
  blocks: PurchaseBlock[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [blocks, setBlocks] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [reason, setReason] = useState<PurchaseBlockReason>("temporada_baja");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const active = useMemo(() => activeBlockOn(blocks, today), [blocks, today]);
  const ordered = useMemo(
    () => [...blocks].sort((a, b) => compareBlocks(a, b, today)),
    [blocks, today],
  );

  const fechasOk = !endDate || endDate >= startDate;

  function guardar() {
    if (!fechasOk) return;
    startTransition(async () => {
      const { data, error } = await supabase
        .from("account_purchase_blocks")
        .insert({
          account_id: accountId,
          reason,
          note: note.trim() || null,
          start_date: startDate,
          end_date: endDate || null,
          created_by: repId,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error("No pudimos registrar la pausa", { description: error?.message });
        return;
      }
      setBlocks((prev) => [data as PurchaseBlock, ...prev]);
      setOpen(false);
      setNote("");
      setEndDate("");
      setReason("temporada_baja");
      toast.success("Cuenta marcada como “no puede comprar”");
      router.refresh();
    });
  }

  /** Reabrir = ponerle fecha de fin ayer, no borrar: el histórico explica por
   *  qué la cuenta no facturó esos meses. */
  function reabrir(block: PurchaseBlock) {
    const ayer = new Date(`${today}T00:00:00Z`);
    ayer.setUTCDate(ayer.getUTCDate() - 1);
    const fin = ayer.toISOString().slice(0, 10);
    // Una pausa que arrancó hoy mismo no puede terminar ayer (lo impide el
    // CHECK de la tabla): en ese caso se cierra el mismo día que empezó.
    const end_date = fin < block.start_date ? block.start_date : fin;

    startTransition(async () => {
      const { error } = await supabase
        .from("account_purchase_blocks")
        .update({ end_date })
        .eq("id", block.id);
      if (error) {
        toast.error("No pudimos reabrir la cuenta", { description: error.message });
        return;
      }
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, end_date } : b)));
      toast.success("La cuenta ya puede comprar");
      router.refresh();
    });
  }

  function borrar(id: string) {
    if (!confirm("¿Borrar este periodo? Se pierde el registro de por qué no compró.")) return;
    startTransition(async () => {
      const { error } = await supabase.from("account_purchase_blocks").delete().eq("id", id);
      if (error) {
        toast.error("No pudimos borrarlo", { description: error.message });
        return;
      }
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-brand-carmesi" />
          <h3 className="font-display text-lg">Puede comprar</h3>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Marcar que no puede comprar
          </Button>
        )}
      </div>

      {active ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pause className="h-4 w-4 text-amber-700" />
            <span className="font-medium text-amber-900">
              No puede comprar · {BLOCK_REASON_LABEL[active.reason]}
            </span>
            <Badge variant="warning">
              {active.end_date
                ? `hasta el ${formatDate(active.end_date)}`
                : "sin fecha de reapertura"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-amber-900/80">
            Desde el {formatDate(active.start_date)}. Mientras dure, esta cuenta no entra en
            la alerta de “un mes sin facturar”. Las visitas y la cobranza siguen igual.
          </p>
          {active.note && <p className="mt-1 text-sm text-amber-900">{active.note}</p>}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => reabrir(active)}
              disabled={pending}
            >
              <Play className="mr-1 h-3.5 w-3.5" /> Ya puede comprar
            </Button>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Sin restricciones: la cuenta puede comprar hoy.
        </p>
      )}

      {ordered.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial de pausas
          </p>
          {ordered.map((b) => {
            const vigente = isBlockActiveOn(b, today);
            return (
              <div
                key={b.id}
                className="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {BLOCK_REASON_LABEL[b.reason]}
                    {vigente && (
                      <Badge variant="warning" className="ml-2">
                        Vigente
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(b.start_date)} →{" "}
                    {b.end_date ? formatDate(b.end_date) : "sin fecha"}
                  </p>
                  {b.note && <p className="mt-0.5 text-xs">{b.note}</p>}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => borrar(b.id)}
                    disabled={pending}
                    aria-label="Borrar periodo"
                    className="shrink-0 text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Esta cuenta no puede comprar</DialogTitle>
            <DialogDescription>
              Mientras dure el periodo dejará de aparecer en el recordatorio de clientes que
              dejaron de pedir y en la tarea de “un mes sin facturar”. Lo que no cambia: se
              le sigue visitando y se le sigue cobrando lo que deba.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <div className="flex flex-wrap gap-2">
                {BLOCK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      reason === r
                        ? "border-brand-carmesi bg-brand-carmesi text-white"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {BLOCK_REASON_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="block-start">Desde</Label>
                <Input
                  id="block-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="block-end">Hasta (opcional)</Label>
                <Input
                  id="block-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Déjalo vacío si todavía no se sabe cuándo vuelven a comprar.
                </p>
              </div>
            </div>

            {!fechasOk && (
              <p className="text-sm text-red-600">
                La fecha de término no puede ser anterior al inicio.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="block-note">Nota (opcional)</Label>
              <Textarea
                id="block-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ej. Corporativo congela compras hasta que reabra el hotel."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={pending || !startDate || !fechasOk}>
                {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
