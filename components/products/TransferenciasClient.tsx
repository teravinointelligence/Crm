"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X, PackageCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { STICKY_CELL, STICKY_HEAD } from "@/components/ui/table-sticky";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import {
  TRANSFER_STATUS,
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_VARIANT,
  type TransferRequest,
  type TransferStatus,
} from "@/lib/warehouse-transfers";

const ALL = "_all";

export function TransferenciasClient({
  requests,
  isAdmin,
  repId,
}: {
  requests: TransferRequest[];
  isAdmin: boolean;
  repId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(ALL);

  const filtered = useMemo(
    () => (status === ALL ? requests : requests.filter((r) => r.status === status)),
    [requests, status],
  );

  const decide = (id: string, next: TransferStatus, notes?: string | null) => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("warehouse_transfer_requests")
        .update({
          status: next,
          decided_by: repId,
          decided_at: new Date().toISOString(),
          admin_notes: notes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) {
        toast.error("No se pudo actualizar", { description: error.message });
        return;
      }
      toast.success(`Solicitud ${TRANSFER_STATUS_LABEL[next].toLowerCase()}`);
      router.refresh();
    });
  };

  const reject = (id: string) => {
    const notes = window.prompt("Motivo del rechazo (opcional):") ?? "";
    decide(id, "rechazada", notes.trim() || null);
  };

  const pendientes = requests.filter((r) => r.status === "pendiente").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Estatus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estatus</SelectItem>
            {TRANSFER_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {TRANSFER_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && pendientes > 0 && (
          <Badge variant="warning">{pendientes} pendiente{pendientes === 1 ? "" : "s"}</Badge>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin solicitudes"
          description={
            requests.length === 0
              ? "Aún no hay solicitudes de transferencia. Genera una desde el catálogo."
              : "No hay solicitudes con ese estatus."
          }
        />
      ) : (
        <TableScroll stickyRight={isAdmin}>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Ruta</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Solicitó</th>
                <th className="px-4 py-3">Estatus</th>
                {isAdmin && <th className={`px-4 py-3 ${STICKY_HEAD}`}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium">{r.product_label}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      {r.from_warehouse} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {r.to_warehouse}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{r.quantity}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.reason || "—"}
                    {r.admin_notes && (
                      <div className="text-xs text-destructive">Nota admin: {r.admin_notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.requester_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={TRANSFER_STATUS_VARIANT[r.status]}>
                      {TRANSFER_STATUS_LABEL[r.status]}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className={`px-4 py-3 ${STICKY_CELL}`}>
                      <div className="flex justify-end gap-1">
                        {r.status === "pendiente" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => decide(r.id, "aprobada")}
                              disabled={pending}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => reject(r.id)}
                              disabled={pending}
                            >
                              <X className="mr-1 h-3.5 w-3.5" /> Rechazar
                            </Button>
                          </>
                        )}
                        {r.status === "aprobada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decide(r.id, "completada")}
                            disabled={pending}
                          >
                            <PackageCheck className="mr-1 h-3.5 w-3.5" /> Marcar completada
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}
