"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImageIcon, AlertTriangle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function CitaEvidence({
  ownerRepId,
  requestId,
  activityId,
  evidencePath,
  canEdit,
}: {
  ownerRepId: string;
  requestId: string;
  activityId: string;
  evidencePath: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const view = async () => {
    if (!evidencePath) return;
    setOpening(true);
    const { data, error } = await supabase.storage.from("evidencias").createSignedUrl(evidencePath, 120);
    setOpening(false);
    if (error || !data?.signedUrl) { toast.error("No pude abrir la foto", { description: error?.message }); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Sube una imagen (foto)"); return; }
    // Ruta: <rep_id>/<request_id>/<activity_id> — el primer folder valida RLS.
    const path = `${ownerRepId}/${requestId}/${activityId}`;
    startTransition(async () => {
      const { error: upErr } = await supabase.storage.from("evidencias").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (upErr) { toast.error("No se pudo subir la foto", { description: upErr.message }); return; }
      const { error: dbErr } = await supabase
        .from("sample_request_activities")
        .update({ evidence_path: path, evidence_uploaded_at: new Date().toISOString() })
        .eq("request_id", requestId)
        .eq("activity_id", activityId);
      if (dbErr) { toast.error("La foto se subió pero no se registró", { description: dbErr.message }); return; }
      toast.success("Evidencia guardada");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      {evidencePath ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            <Check className="h-3 w-3" /> Evidencia
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={view} disabled={opening}>
            <ImageIcon className="mr-1 h-3.5 w-3.5" /> {opening ? "Abriendo…" : "Ver"}
          </Button>
        </>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          <AlertTriangle className="h-3 w-3" /> Falta evidencia
        </span>
      )}
      {canEdit && (
        <>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={pending} onClick={() => inputRef.current?.click()}>
            <Camera className="mr-1 h-3.5 w-3.5" /> {pending ? "Subiendo…" : evidencePath ? "Cambiar" : "Subir foto"}
          </Button>
        </>
      )}
    </div>
  );
}
