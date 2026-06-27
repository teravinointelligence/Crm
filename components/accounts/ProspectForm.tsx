"use client";

// Captura rápida de un prospecto con "claim": llama a la RPC claim_prospect, que
// es atómica y aplica la regla de zona + el bloqueo de duplicados (mismo nombre de
// negocio en la misma zona). El vendedor tiene su zona fija; el admin elige zona y,
// opcionalmente, a qué vendedor se lo asigna.

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
import { ACCOUNT_TYPES, REGIONS, type SalesRep } from "@/types/database";

type Props = {
  reps: SalesRep[];
  isAdmin: boolean;
  myRegion: string | null;
};

export function ProspectForm({ reps, isAdmin, myRegion }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  // El vendedor queda fijo a su zona; el admin la elige.
  const [region, setRegion] = useState<string>(isAdmin ? "" : myRegion ?? "");
  const [accountType, setAccountType] = useState<string>("");
  const [assignedRep, setAssignedRep] = useState<string>("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const businessName = String(form.get("business_name") ?? "").trim();

    if (!businessName) {
      toast.error("El nombre del negocio es obligatorio");
      return;
    }
    if (!region) {
      toast.error(
        isAdmin
          ? "Selecciona la zona del prospecto"
          : "No tienes una zona asignada; pide a un admin que te la configure",
      );
      return;
    }

    startTransition(async () => {
      const { data, error } = await supabase.rpc("claim_prospect", {
        p_business_name: businessName,
        p_region: region,
        p_account_type: accountType || null,
        p_city: String(form.get("city") ?? "").trim() || null,
        p_phone: String(form.get("phone") ?? "").trim() || null,
        p_email: String(form.get("email") ?? "").trim() || null,
        p_notes: String(form.get("notes") ?? "").trim() || null,
        p_assigned_rep_id: isAdmin ? assignedRep || null : null,
      });

      if (error) {
        toast.error("No pudimos registrar el prospecto", {
          description: error.message,
        });
        return;
      }

      const res = (data ?? {}) as {
        status?: string;
        account_id?: string;
        dueno?: string;
        zona?: string;
        tu_zona?: string;
        reason?: string;
      };

      switch (res.status) {
        case "registrado":
          toast.success("Prospecto registrado a tu nombre");
          router.push(`/cuentas/${res.account_id}`);
          router.refresh();
          break;
        case "tomado":
          toast.error("Ese prospecto ya está registrado", {
            description: `Lo tiene ${res.dueno} · ${res.zona}. No se puede registrar dos veces.`,
          });
          break;
        case "zona_invalida":
          toast.error("Fuera de tu zona", {
            description: `Solo puedes registrar prospectos de tu zona${
              res.tu_zona ? ` (${res.tu_zona})` : ""
            }.`,
          });
          break;
        default:
          toast.error("No pudimos registrar el prospecto", {
            description: res.reason ?? "Intenta de nuevo.",
          });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="business_name">Nombre del negocio *</Label>
        <Input
          id="business_name"
          name="business_name"
          required
          placeholder="Hotel Esperanza Los Cabos"
        />
        <p className="text-xs text-muted-foreground">
          El duplicado se detecta por el nombre del negocio dentro de la zona, así
          que captúralo como lo conoces.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="account_type">Tipo</Label>
        <Select value={accountType || undefined} onValueChange={setAccountType}>
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
        <Label htmlFor="region">Zona *</Label>
        {isAdmin ? (
          <Select value={region || undefined} onValueChange={setRegion}>
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
        ) : (
          <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
            {myRegion ? (
              <span className="font-medium">{myRegion}</span>
            ) : (
              <span className="text-muted-foreground">Sin zona asignada</span>
            )}
          </div>
        )}
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            Solo puedes registrar prospectos de tu zona.
          </p>
        )}
      </div>

      {isAdmin && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="assigned_rep_id">Asignar a vendedor</Label>
          <Select value={assignedRep || undefined} onValueChange={setAssignedRep}>
            <SelectTrigger id="assigned_rep_id">
              <SelectValue placeholder="Yo (admin)" />
            </SelectTrigger>
            <SelectContent>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name} {r.primary_region ? `· ${r.primary_region}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Si lo dejas vacío, el prospecto queda a tu nombre.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="city">Ciudad</Label>
        <Input id="city" name="city" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" type="tel" placeholder="Opcional" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" placeholder="Opcional" />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Cómo llegaste al prospecto, contacto, próximos pasos…"
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
          {pending ? "Registrando…" : "Registrar prospecto"}
        </Button>
      </div>
    </form>
  );
}
