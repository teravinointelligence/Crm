"use client";

import { useState, useTransition } from "react";
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
import { tierForRegion } from "@/lib/pricing";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  REGIONS,
  type Account,
  type Region,
  type SalesRep,
} from "@/types/database";

type Props = {
  account?: Account;
  reps: SalesRep[];
  isAdmin: boolean;
  defaultRepId?: string;
};

export function AccountForm({ account, reps, isAdmin, defaultRepId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [region, setRegion] = useState<Region | "">(
    (account?.region as Region) ?? "",
  );
  const [priceTier, setPriceTier] = useState<"base" | "+10">(
    (account?.price_tier as "base" | "+10") ??
      tierForRegion(account?.region as Region) ??
      "base",
  );

  const handleRegionChange = (value: string) => {
    const next = value as Region;
    setRegion(next);
    setPriceTier(tierForRegion(next));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      business_name: String(formData.get("business_name") ?? "").trim(),
      account_type: (formData.get("account_type") as string) || null,
      region: (formData.get("region") as string) || null,
      city: (formData.get("city") as string) || null,
      address: (formData.get("address") as string) || null,
      rfc: (formData.get("rfc") as string) || null,
      fiscal_name: (formData.get("fiscal_name") as string) || null,
      client_number: (formData.get("client_number") as string)?.trim() || null,
      credit_days: (() => {
        const raw = String(formData.get("credit_days") ?? "").trim();
        if (raw === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
      })(),
      dias_pago: (formData.get("dias_pago") as string)?.trim() || null,
      dias_revision: (formData.get("dias_revision") as string)?.trim() || null,
      ventana_revision: (() => {
        const n = Number(String(formData.get("ventana_revision") ?? "").trim());
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : 45;
      })(),
      ventana_suspension: (() => {
        const n = Number(String(formData.get("ventana_suspension") ?? "").trim());
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : 62;
      })(),
      is_legacy: formData.get("is_legacy") === "on",
      price_tier: priceTier,
      assigned_rep_id:
        (formData.get("assigned_rep_id") as string) || defaultRepId || null,
      status: (formData.get("status") as string) || "prospecto",
      notes: (formData.get("notes") as string) || null,
    };

    if (!payload.business_name) {
      toast.error("El nombre del negocio es obligatorio");
      return;
    }

    startTransition(async () => {
      const { data, error } = account
        ? await supabase
            .from("accounts")
            .update(payload)
            .eq("id", account.id)
            .select("id")
            .single()
        : await supabase
            .from("accounts")
            .insert(payload)
            .select("id")
            .single();

      if (error) {
        toast.error("No pudimos guardar la cuenta", {
          description: error.message,
        });
        return;
      }
      toast.success(account ? "Cuenta actualizada" : "Cuenta creada");
      router.push(`/cuentas/${data!.id}`);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="business_name">Nombre del negocio *</Label>
        <Input
          id="business_name"
          name="business_name"
          required
          defaultValue={account?.business_name}
          placeholder="Hotel Esperanza Los Cabos"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account_type">Tipo</Label>
        <Select name="account_type" defaultValue={account?.account_type ?? undefined}>
          <SelectTrigger id="account_type">
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select name="status" defaultValue={account?.status ?? "prospecto"}>
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="region">Región</Label>
        <Select
          name="region"
          value={region || undefined}
          onValueChange={handleRegionChange}
        >
          <SelectTrigger id="region">
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            {REGIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tier de precio</Label>
        <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
          {priceTier === "+10" ? (
            <span className="font-medium text-brand-carmesi">
              +10% (La Paz / Tijuana)
            </span>
          ) : (
            <span className="text-muted-foreground">Base</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="city">Ciudad</Label>
        <Input id="city" name="city" defaultValue={account?.city ?? ""} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="address">Dirección</Label>
        <Input
          id="address"
          name="address"
          defaultValue={account?.address ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rfc">RFC</Label>
        <Input
          id="rfc"
          name="rfc"
          defaultValue={account?.rfc ?? ""}
          placeholder="XAXX010101000"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fiscal_name">Razón social</Label>
        <Input
          id="fiscal_name"
          name="fiscal_name"
          defaultValue={account?.fiscal_name ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="client_number"># Cliente (CONTPAQi)</Label>
        <Input
          id="client_number"
          name="client_number"
          defaultValue={account?.client_number ?? ""}
          placeholder="p. ej. 175"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="credit_days">Días de crédito</Label>
        <Input
          id="credit_days"
          name="credit_days"
          type="number"
          min={0}
          max={365}
          step={1}
          defaultValue={account?.credit_days ?? ""}
          placeholder="0 = contado · ej. 30"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dias_pago">Días de pago</Label>
        <Input
          id="dias_pago"
          name="dias_pago"
          defaultValue={account?.dias_pago ?? ""}
          placeholder="p. ej. Martes y jueves"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dias_revision">Días de revisión</Label>
        <Input
          id="dias_revision"
          name="dias_revision"
          defaultValue={account?.dias_revision ?? ""}
          placeholder="p. ej. Lunes"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ventana_revision">Ventana "Por revisar" (días vencidos)</Label>
        <Input
          id="ventana_revision"
          name="ventana_revision"
          type="number"
          min={0}
          max={365}
          step={1}
          defaultValue={account?.ventana_revision ?? 45}
          placeholder="45"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ventana_suspension">Ventana "Suspender" (días vencidos)</Label>
        <Input
          id="ventana_suspension"
          name="ventana_suspension"
          type="number"
          min={0}
          max={365}
          step={1}
          defaultValue={account?.ventana_suspension ?? 62}
          placeholder="62"
        />
      </div>

      <div className="flex items-center gap-2 sm:col-span-2">
        <input
          id="is_legacy"
          name="is_legacy"
          type="checkbox"
          defaultChecked={account?.is_legacy ?? false}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="is_legacy" className="font-normal">
          Cuenta legacy/estratégica (se excluye de métricas operativas)
        </Label>
      </div>

      {isAdmin && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="assigned_rep_id">Vendedor asignado</Label>
          <Select
            name="assigned_rep_id"
            defaultValue={account?.assigned_rep_id ?? defaultRepId ?? undefined}
          >
            <SelectTrigger id="assigned_rep_id">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name} {r.primary_region ? `· ${r.primary_region}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={account?.notes ?? ""}
          placeholder="Cuenta ancla, sommelier exigente, etc."
        />
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
          {pending ? "Guardando…" : account ? "Guardar cambios" : "Crear cuenta"}
        </Button>
      </div>
    </form>
  );
}
