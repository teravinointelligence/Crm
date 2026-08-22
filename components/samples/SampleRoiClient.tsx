"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, CircleDollarSign, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SampleOutcome, SampleRoiRow } from "@/lib/sample-roi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatCurrency, formatDate } from "@/lib/utils";

const OUTCOME_LABEL: Record<SampleOutcome, string> = {
  vendida: "Vendida",
  encartada: "Encartada",
  interesado: "Interesado",
  contactado: "Contactado",
  sin_interes: "Sin interés",
  en_el_aire: "En el aire",
  pendiente: "Pendiente",
};

const OUTCOME_VARIANT: Record<SampleOutcome, "success" | "accent" | "warning" | "danger" | "muted"> = {
  vendida: "success",
  encartada: "success",
  interesado: "accent",
  contactado: "warning",
  sin_interes: "danger",
  en_el_aire: "danger",
  pendiente: "muted",
};

const ALL = "__all";

export function SampleRoiClient({ rows, showRep }: { rows: SampleRoiRow[]; showRep: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState(ALL);
  const [editing, setEditing] = useState<SampleRoiRow | null>(null);
  const [status, setStatus] = useState("pendiente");
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");

  const filtered = useMemo(
    () => (filter === ALL ? rows : rows.filter((row) => row.outcome === filter)),
    [filter, rows],
  );

  const openFollowUp = (row: SampleRoiRow) => {
    setEditing(row);
    setStatus(row.followUpStatus);
    setNotes(row.followUpNotes ?? "");
    setNextDate(row.nextFollowUpDate ?? "");
  };

  const saveFollowUp = () => {
    if (!editing) return;
    startTransition(async () => {
      const { error } = await supabase
        .from("sample_conversion_events")
        .update({
          follow_up_status: status,
          follow_up_notes: notes.trim() || null,
          next_follow_up_date: nextDate || null,
        })
        .eq("id", editing.id);
      if (error) {
        toast.error("No se pudo guardar el seguimiento", { description: error.message });
        return;
      }
      toast.success("Seguimiento actualizado");
      setEditing(null);
      router.refresh();
    });
  };

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Todavía no hay muestras con cliente para medir. La siguiente toma del banco quedará registrada aquí.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">Seguimiento de oportunidades</h2>
            <p className="text-xs text-muted-foreground">
              La venta y el encarte se detectan automáticamente; registra aquí el contacto y el interés.
            </p>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los estados</SelectItem>
              {Object.entries(OUTCOME_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                {showRep && <th className="px-4 py-3">Vendedor</th>}
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vino</th>
                <th className="px-4 py-3 text-right">Botellas</th>
                <th className="px-4 py-3 text-right">Inversión</th>
                <th className="px-4 py-3 text-right">Venta atribuida</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(row.sampleDate)}</td>
                  {showRep && <td className="px-4 py-3">{row.repName}</td>}
                  <td className="px-4 py-3 font-medium">{row.accountName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.productName}</td>
                  <td className="px-4 py-3 text-right">{row.quantity.toLocaleString("es-MX")}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(row.investment)}
                    {row.costEstimated && <div className="text-[10px] text-amber-700">estimado</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {row.revenue > 0 ? formatCurrency(row.revenue) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={OUTCOME_VARIANT[row.outcome]}>{OUTCOME_LABEL[row.outcome]}</Badge>
                    {row.nextFollowUpDate && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <CalendarClock className="h-3 w-3" /> {formatDate(row.nextFollowUpDate)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openFollowUp(row)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Seguimiento
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">No hay muestras con ese estado.</div>
          )}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seguimiento de la muestra</DialogTitle>
            <DialogDescription>
              {editing?.accountName} · {editing?.productName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Estado comercial</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="contactado">Contactado</SelectItem>
                  <SelectItem value="interesado">Interesado</SelectItem>
                  <SelectItem value="sin_interes">Sin interés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sample_next_follow_up">Próximo seguimiento</Label>
              <Input
                id="sample_next_follow_up"
                type="date"
                value={nextDate}
                onChange={(event) => setNextDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sample_follow_up_notes">Notas</Label>
              <Textarea
                id="sample_follow_up_notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Qué dijo el cliente, siguiente paso…"
                rows={4}
              />
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1 font-medium text-foreground">
                {editing?.revenue ? <CircleDollarSign className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                Resultado automático
              </div>
              El CRM cruza este cliente y vino con encartes y ventas de los siguientes días; no necesitas capturar la venta a mano.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>Cancelar</Button>
              <Button onClick={saveFollowUp} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
