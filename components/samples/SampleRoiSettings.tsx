"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SampleRoiSettings } from "@/lib/sample-roi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SampleRoiSettingsForm({ settings }: { settings: SampleRoiSettings }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const number = (name: string) => Number(data.get(name));
    const payload = {
      analysis_days: number("analysis_days"),
      followup_days: number("followup_days"),
      conversion_days: number("conversion_days"),
      client_window_days: number("client_window_days"),
      min_opportunities: number("min_opportunities"),
      base_limit: number("base_limit"),
      medium_limit: number("medium_limit"),
      low_limit: number("low_limit"),
      medium_conversion_pct: number("medium_conversion_pct"),
      low_conversion_pct: number("low_conversion_pct"),
      medium_roi: number("medium_roi"),
      low_roi: number("low_roi"),
    };
    if (payload.low_limit > payload.medium_limit || payload.medium_limit > payload.base_limit) {
      toast.error("Los límites deben ir de menor a mayor: crítico ≤ preventivo ≤ normal");
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.from("sample_conversion_settings").update(payload).eq("id", true);
      if (error) {
        toast.error("No se pudo actualizar el candado", { description: error.message });
        return;
      }
      toast.success("Reglas del candado actualizadas");
      router.refresh();
    });
  };

  const fields: Array<{ name: keyof SampleRoiSettings; label: string; step?: string }> = [
    { name: "base_limit", label: "Límite normal" },
    { name: "medium_limit", label: "Límite preventivo" },
    { name: "low_limit", label: "Límite crítico" },
    { name: "medium_conversion_pct", label: "Conversión preventiva (%)", step: "0.01" },
    { name: "low_conversion_pct", label: "Conversión crítica (%)", step: "0.01" },
    { name: "medium_roi", label: "ROI preventivo", step: "0.01" },
    { name: "low_roi", label: "ROI crítico", step: "0.01" },
    { name: "min_opportunities", label: "Mínimo para evaluar" },
    { name: "client_window_days", label: "Ventana por cliente (días)" },
    { name: "followup_days", label: "Plazo de seguimiento (días)" },
    { name: "conversion_days", label: "Ventana de atribución (días)" },
    { name: "analysis_days", label: "Periodo de desempeño (días)" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" /> Candado dinámico</CardTitle>
        <CardDescription>
          Después del mínimo de oportunidades, basta caer en conversión o ROI para reducir el límite por cliente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                name={field.name}
                type="number"
                min={0}
                step={field.step ?? "1"}
                required
                defaultValue={settings[field.name]}
              />
            </div>
          ))}
          <div className="flex items-end lg:col-span-4 lg:justify-end">
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar reglas"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
