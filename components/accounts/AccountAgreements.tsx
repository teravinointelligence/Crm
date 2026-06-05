"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Upload,
  FileCheck2,
  Trash2,
  CalendarDays,
  User,
  Briefcase,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import {
  AGREEMENT_TYPE_LABELS,
  AGREEMENT_STATUS_LABELS,
  EQUIPMENT_KIND_LABELS,
  type AgreementStatus,
  type AgreementWithEquipment,
} from "@/types/database";

export type AgreementRow = AgreementWithEquipment & {
  contactName: string | null;
  repName: string | null;
};

const STATUS_VARIANT: Record<AgreementStatus, "success" | "warning" | "danger"> = {
  vigente: "success",
  vencido: "warning",
  cancelado: "danger",
};

export function AccountAgreements({
  accountId,
  agreements,
  canEdit,
}: {
  accountId: string;
  agreements: AgreementRow[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Registro cronológico de acuerdos comerciales con esta empresa.
        </p>
        {canEdit && (
          <Button asChild size="sm">
            <Link href={`/cuentas/${accountId}/acuerdos/nuevo`}>
              <Plus className="mr-1 h-4 w-4" /> Nuevo acuerdo
            </Link>
          </Button>
        )}
      </div>

      {agreements.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin acuerdos"
          description="Registra el primer acuerdo: comodato de cavas/Coravin, precio especial, consignación…"
        />
      ) : (
        <ol className="relative space-y-4 border-l-2 border-border pl-6">
          {agreements.map((a) => (
            <AgreementCard key={a.id} accountId={accountId} agreement={a} canEdit={canEdit} />
          ))}
        </ol>
      )}
    </div>
  );
}

function AgreementCard({
  accountId,
  agreement: a,
  canEdit,
}: {
  accountId: string;
  agreement: AgreementRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState(false);

  const conditions: string[] = [];
  if (a.discount_pct != null) conditions.push(`${a.discount_pct}% desc.`);
  if (a.credit_days != null) conditions.push(a.credit_days === 0 ? "Contado" : `${a.credit_days} días crédito`);
  if (a.valid_from || a.valid_until)
    conditions.push(
      `Vigencia ${a.valid_from ? formatDate(a.valid_from) : "—"} → ${a.valid_until ? formatDate(a.valid_until) : "—"}`,
    );

  const viewSigned = async () => {
    if (!a.document_path) return;
    setOpening(true);
    const { data, error } = await supabase.storage.from("acuerdos").createSignedUrl(a.document_path, 120);
    setOpening(false);
    if (error || !data?.signedUrl) {
      toast.error("No pude abrir el PDF firmado", { description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const onPickSigned = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Sube un archivo PDF");
      return;
    }
    // Ruta: <account_id>/<agreement_id>/firmado.pdf — el primer folder valida RLS.
    const path = `${accountId}/${a.id}/firmado.pdf`;
    startTransition(async () => {
      const { error: upErr } = await supabase.storage.from("acuerdos").upload(path, file, {
        upsert: true,
        contentType: "application/pdf",
      });
      if (upErr) {
        toast.error("No se pudo subir el PDF", { description: upErr.message });
        return;
      }
      const { error: dbErr } = await supabase
        .from("agreements")
        .update({ document_path: path, document_uploaded_at: new Date().toISOString() })
        .eq("id", a.id);
      if (dbErr) {
        toast.error("El PDF se subió pero no se registró", { description: dbErr.message });
        return;
      }
      toast.success("PDF firmado guardado");
      router.refresh();
    });
  };

  const remove = () => {
    if (!confirm(`¿Eliminar el acuerdo "${a.title}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const { error } = await supabase.from("agreements").delete().eq("id", a.id);
      if (error) {
        toast.error("No se pudo eliminar", { description: error.message });
        return;
      }
      toast.success("Acuerdo eliminado");
      router.refresh();
    });
  };

  return (
    <li className="relative">
      <span className="absolute -left-[1.92rem] top-5 h-3 w-3 rounded-full border-2 border-brand-carmesi bg-background" />
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(a.agreement_date)}
              </div>
              <h4 className="font-medium">{a.title}</h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="accent">{AGREEMENT_TYPE_LABELS[a.type] ?? a.type}</Badge>
              <Badge variant={STATUS_VARIANT[a.status] ?? "muted"}>
                {AGREEMENT_STATUS_LABELS[a.status] ?? a.status}
              </Badge>
            </div>
          </div>

          {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {a.contactName && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {a.contactName}
              </span>
            )}
            {a.repName && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {a.repName}
              </span>
            )}
            {conditions.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" /> {c}
              </span>
            ))}
          </div>

          {a.price_notes && (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">{a.price_notes}</p>
          )}

          {a.equipment.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Equipo a comodato</div>
              <div className="flex flex-wrap gap-1.5">
                {a.equipment.map((e) => (
                  <span
                    key={e.id}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                      e.status === "devuelto"
                        ? "border-border text-muted-foreground line-through"
                        : "border-brand-oro/50 text-foreground"
                    }`}
                  >
                    {EQUIPMENT_KIND_LABELS[e.kind] ?? e.kind}
                    {e.quantity > 1 ? ` ×${e.quantity}` : ""}: {e.description}
                    {e.serial ? ` (${e.serial})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button asChild size="sm" variant="outline">
              <a href={`/api/cuentas/${accountId}/acuerdos/${a.id}/pdf`} target="_blank" rel="noreferrer">
                <FileText className="mr-1 h-3.5 w-3.5" /> PDF generado
              </a>
            </Button>
            {a.document_path ? (
              <Button size="sm" variant="outline" onClick={viewSigned} disabled={opening}>
                <FileCheck2 className="mr-1 h-3.5 w-3.5" /> {opening ? "Abriendo…" : "Ver firmado"}
              </Button>
            ) : null}
            {canEdit && (
              <>
                <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onPickSigned} />
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => inputRef.current?.click()}>
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  {pending ? "Subiendo…" : a.document_path ? "Reemplazar firmado" : "Subir firmado"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  disabled={pending}
                  onClick={remove}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
