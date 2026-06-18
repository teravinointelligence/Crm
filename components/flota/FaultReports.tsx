"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Wrench, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import {
  FAULT_TYPES,
  FAULT_URGENCY,
  FAULT_STATUS,
  URGENCY_LABEL,
  STATUS_LABEL,
  type FaultReport,
  type FaultStatus,
  type FaultUrgency,
} from "@/lib/flota-faults";

const MANUAL = "__manual__";

const URGENCY_VARIANT: Record<FaultUrgency, "danger" | "warning" | "muted"> = {
  alta: "danger",
  media: "warning",
  baja: "muted",
};
const STATUS_VARIANT: Record<FaultStatus, "warning" | "default" | "success" | "muted"> = {
  reportado: "warning",
  en_proceso: "default",
  atendido: "success",
  descartado: "muted",
};

export function FaultReports({
  vehicles,
  reports,
  repId,
  isManager,
}: {
  vehicles: { id: string; label: string }[];
  reports: FaultReport[];
  repId: string;
  isManager: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [vehicleSel, setVehicleSel] = useState(vehicles.length ? vehicles[0].id : MANUAL);
  const [manualVehicle, setManualVehicle] = useState("");
  const [faultType, setFaultType] = useState<string>(FAULT_TYPES[0]);
  const [urgency, setUrgency] = useState<FaultUrgency>("media");
  const [km, setKm] = useState("");
  const [description, setDescription] = useState("");

  const submit = () => {
    const vehicle = vehicles.find((v) => v.id === vehicleSel);
    const vehicleLabel = vehicleSel === MANUAL ? manualVehicle.trim() : vehicle?.label ?? "";
    if (!vehicleLabel) {
      toast.error("Indica el vehículo");
      return;
    }
    if (!description.trim()) {
      toast.error("Describe la falla");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/flota/fallas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: vehicleSel === MANUAL ? null : vehicleSel,
          vehicleLabel,
          faultType,
          urgency,
          km: km !== "" ? Number(km) : null,
          description: description.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo reportar la falla", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Falla reportada", {
        description: data.notified ? "Se notificó a logística." : undefined,
      });
      setDescription("");
      setKm("");
      setManualVehicle("");
      router.refresh();
    });
  };

  const changeStatus = (id: string, status: FaultStatus) => {
    startTransition(async () => {
      const supabase = createClient();
      const closing = status === "atendido" || status === "descartado";
      const { error } = await supabase
        .from("fleet_fault_reports")
        .update({
          status,
          resolved_at: closing ? new Date().toISOString() : null,
          resolved_by: closing ? repId : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) {
        toast.error("No se pudo actualizar", { description: error.message });
        return;
      }
      toast.success("Estatus actualizado");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Formulario de reporte */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-brand-carmesi" />
            <h2 className="font-display text-lg">Reportar una falla</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vehículo</Label>
              {vehicles.length > 0 ? (
                <Select value={vehicleSel} onValueChange={setVehicleSel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige el vehículo" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={MANUAL}>Otro / escribir a mano…</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {(vehicles.length === 0 || vehicleSel === MANUAL) && (
                <Input
                  placeholder="Marca, modelo y placas"
                  value={manualVehicle}
                  onChange={(e) => setManualVehicle(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de falla</Label>
              <Select value={faultType} onValueChange={setFaultType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAULT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Urgencia</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency(v as FaultUrgency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAULT_URGENCY.map((u) => (
                    <SelectItem key={u} value={u}>
                      {URGENCY_LABEL[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="km">Kilometraje (opcional)</Label>
              <Input
                id="km"
                type="number"
                min={0}
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="ej. 84500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">¿Qué tiene el carro?</Label>
            <Textarea
              id="desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ej. Le toca servicio de los 80 mil; la llanta delantera derecha está baja y rechina al frenar."
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={pending}>
              <Plus className="mr-1 h-4 w-4" />
              {pending ? "Enviando…" : "Reportar falla"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de reportes */}
      <div className="space-y-3">
        <h2 className="font-display text-lg">
          {isManager ? "Fallas reportadas" : "Mis reportes"}
        </h2>
        {reports.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Sin fallas reportadas"
            description="Cuando reportes una falla aparecerá aquí."
          />
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Card key={r.id} className={r.status === "atendido" || r.status === "descartado" ? "opacity-70" : ""}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.vehicle_label}</span>
                      <Badge variant="muted">{r.fault_type}</Badge>
                      <Badge variant={URGENCY_VARIANT[r.urgency]}>Urgencia {URGENCY_LABEL[r.urgency]}</Badge>
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                    {isManager ? (
                      <Select value={r.status} onValueChange={(v) => changeStatus(r.id, v as FaultStatus)}>
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FAULT_STATUS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>

                  <p className="whitespace-pre-line text-sm">{r.description}</p>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.km != null && <span>{r.km.toLocaleString("es-MX")} km</span>}
                    {r.reporter_name && <span>Reportó: {r.reporter_name}</span>}
                    <span>{formatDateTime(r.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
