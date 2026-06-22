"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FileRow = {
  id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  photo: "Foto",
  flyer: "Flyer",
  sop_pdf: "SOP / PDF",
  report: "Reporte",
  other: "Otro",
};

export function EventFiles({
  eventId,
  files,
  canManage,
}: {
  eventId: string;
  files: FileRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [fileType, setFileType] = useState("flyer");

  const onFile = (file: File | null) => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("file_type", fileType);
      const res = await fetch(`/api/eventos/${eventId}/files`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) return void toast.error("No se pudo subir", { description: json.error });
      toast.success("Archivo subido");
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/eventos/${eventId}/files?fileId=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) return void toast.error("No se pudo eliminar", { description: json.error });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">Archivos y flyer</h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <Select value={fileType} onValueChange={setFileType}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                onFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
              <Upload className="mr-1 h-4 w-4" /> {pending ? "Subiendo…" : "Subir"}
            </Button>
          </div>
        )}
      </div>

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sin archivos.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3"
            >
              <a
                href={f.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-2 hover:underline"
              >
                {f.file_type === "photo" ? (
                  <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{f.file_name || TYPE_LABEL[f.file_type ?? "other"]}</span>
              </a>
              {canManage && (
                <Button size="icon" variant="ghost" onClick={() => remove(f.id)} disabled={pending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
