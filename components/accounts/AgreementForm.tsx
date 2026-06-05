"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  AGREEMENT_TYPE_LABELS,
  AGREEMENT_STATUS_LABELS,
  EQUIPMENT_KIND_LABELS,
  type AgreementType,
  type AgreementStatus,
  type EquipmentKind,
} from "@/types/database";

type Option = { id: string; label: string };

type EquipmentRow = {
  key: string;
  kind: EquipmentKind;
  description: string;
  quantity: string;
  serial: string;
};

let rowSeq = 0;
const newRow = (): EquipmentRow => ({
  key: `r${rowSeq++}`,
  kind: "cava",
  description: "",
  quantity: "1",
  serial: "",
});

export function AgreementForm({
  accountId,
  contacts,
  reps,
  defaultRepId,
}: {
  accountId: string;
  contacts: Option[];
  reps: Option[];
  defaultRepId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<AgreementType>("comodato");
  const [status, setStatus] = useState<AgreementStatus>("vigente");
  const [contactId, setContactId] = useState<string>("");
  const [repId, setRepId] = useState<string>(defaultRepId ?? "");
  const [equipment, setEquipment] = useState<EquipmentRow[]>([newRow()]);

  const updateRow = (key: string, patch: Partial<EquipmentRow>) =>
    setEquipment((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) =>
    setEquipment((rows) => rows.filter((r) => r.key !== key));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    if (!title) {
      toast.error("El título del acuerdo es obligatorio");
      return;
    }
    const discountRaw = String(fd.get("discount_pct") ?? "").trim();
    const creditRaw = String(fd.get("credit_days") ?? "").trim();

    const payload = {
      account_id: accountId,
      agreement_date: String(fd.get("agreement_date") ?? today),
      title,
      description: String(fd.get("description") ?? "").trim() || null,
      type,
      status,
      price_notes: String(fd.get("price_notes") ?? "").trim() || null,
      discount_pct: discountRaw ? Number(discountRaw) : null,
      credit_days: creditRaw ? Number(creditRaw) : null,
      valid_from: String(fd.get("valid_from") ?? "") || null,
      valid_until: String(fd.get("valid_until") ?? "") || null,
      contact_id: contactId || null,
      rep_id: repId || null,
    };

    const equipmentRows = equipment
      .filter((r) => r.description.trim())
      .map((r) => ({
        kind: r.kind,
        description: r.description.trim(),
        quantity: Math.max(1, Number(r.quantity) || 1),
        serial: r.serial.trim() || null,
      }));

    if (type === "comodato" && equipmentRows.length === 0) {
      toast.error("Agrega al menos un equipo para un acuerdo de comodato");
      return;
    }

    startTransition(async () => {
      const { data: created, error } = await supabase
        .from("agreements")
        .insert(payload)
        .select("id")
        .single();
      if (error || !created) {
        toast.error("No se pudo guardar el acuerdo", { description: error?.message });
        return;
      }
      if (equipmentRows.length > 0) {
        const { error: eqErr } = await supabase
          .from("agreement_equipment")
          .insert(equipmentRows.map((r) => ({ ...r, agreement_id: created.id })));
        if (eqErr) {
          toast.error("El acuerdo se guardó, pero el equipo no", { description: eqErr.message });
          router.push(`/cuentas/${accountId}?tab=acuerdos`);
          return;
        }
      }
      toast.success("Acuerdo registrado");
      router.push(`/cuentas/${accountId}?tab=acuerdos`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Título del acuerdo *</Label>
            <Input id="title" name="title" required placeholder="Comodato de 2 cavas y equipo Coravin" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agreement_date">Fecha del acuerdo</Label>
            <Input id="agreement_date" name="agreement_date" type="date" defaultValue={today} />
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as AgreementType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AGREEMENT_TYPE_LABELS) as AgreementType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {AGREEMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Estatus</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AgreementStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AGREEMENT_STATUS_LABELS) as AgreementStatus[]).map((st) => (
                  <SelectItem key={st} value={st}>
                    {AGREEMENT_STATUS_LABELS[st]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Pactado con (contacto)</Label>
            <Select value={contactId || undefined} onValueChange={setContactId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin especificar" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Vendedor Teravino</Label>
            <Select value={repId || undefined} onValueChange={setRepId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin especificar" />
              </SelectTrigger>
              <SelectContent>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Descripción / lo pactado</Label>
            <Textarea id="description" name="description" rows={3} placeholder="Detalle del acuerdo…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-display text-lg">Condiciones comerciales</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="discount_pct">Descuento (%)</Label>
              <Input id="discount_pct" name="discount_pct" type="number" step="0.01" min="0" placeholder="10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit_days">Días de crédito</Label>
              <Input id="credit_days" name="credit_days" type="number" min="0" placeholder="30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valid_from">Vigente desde</Label>
              <Input id="valid_from" name="valid_from" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valid_until">Vigente hasta</Label>
              <Input id="valid_until" name="valid_until" type="date" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="price_notes">Precios / condiciones (texto libre)</Label>
              <Textarea id="price_notes" name="price_notes" rows={2} placeholder="Lista de precios, mínimos de compra, etc." />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Equipo a comodato</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setEquipment((r) => [...r, newRow()])}>
              <Plus className="mr-1 h-4 w-4" /> Agregar equipo
            </Button>
          </div>
          {equipment.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin equipo en comodato.</p>
          )}
          <div className="space-y-3">
            {equipment.map((row) => (
              <div key={row.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[10rem_1fr_8rem_5rem_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={row.kind} onValueChange={(v) => updateRow(row.key, { kind: v as EquipmentKind })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(EQUIPMENT_KIND_LABELS) as EquipmentKind[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {EQUIPMENT_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción</Label>
                  <Input
                    value={row.description}
                    onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    placeholder="Cava EuroCave 2 zonas"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">No. de serie</Label>
                  <Input
                    value={row.serial}
                    onChange={(e) => updateRow(row.key, { serial: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cant.</Label>
                  <Input
                    type="number"
                    min="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={() => removeRow(row.key)}
                  aria-label="Quitar equipo"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar acuerdo"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
