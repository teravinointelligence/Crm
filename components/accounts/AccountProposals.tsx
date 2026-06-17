"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileText, Trash2, CalendarDays, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

export type ProposalRow = {
  id: string;
  account_id: string;
  title: string;
  file_url: string;
  uploaded_by: string | null;
  created_at: string;
  rep_name: string | null;
};

export function AccountProposals({
  accountId,
  repId,
  proposals: initial,
  canEdit,
}: {
  accountId: string;
  repId: string;
  proposals: ProposalRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [proposals, setProposals] = useState(initial);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file || !title.trim()) return;
    const supabase = createClient();

    const ext = file.name.split(".").pop();
    const path = `propuestas/${accountId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("documentos")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      toast.error("Error al subir el archivo");
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("documentos")
      .getPublicUrl(path);

    const { data: row, error: insertErr } = await supabase
      .from("account_proposals")
      .insert({
        account_id: accountId,
        title: title.trim(),
        file_url: publicUrl,
        uploaded_by: repId,
      })
      .select("id, account_id, title, file_url, uploaded_by, created_at")
      .single();

    if (insertErr || !row) {
      toast.error("Error al guardar la propuesta");
      return;
    }

    toast.success("Propuesta cargada");
    setProposals((prev) => [{ ...row, rep_name: null }, ...prev]);
    setOpen(false);
    setTitle("");
    setFile(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: string, fileUrl: string) {
    if (!confirm("¿Eliminar esta propuesta?")) return;
    const supabase = createClient();

    // Extract storage path from public URL
    const url = new URL(fileUrl);
    const storagePath = url.pathname.split("/object/public/documentos/")[1];
    if (storagePath) {
      await supabase.storage.from("documentos").remove([storagePath]);
    }

    const { error } = await supabase
      .from("account_proposals")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar");
      return;
    }

    toast.success("Propuesta eliminada");
    setProposals((prev) => prev.filter((p) => p.id !== id));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            Subir propuesta
          </Button>
        </div>
      )}

      {proposals.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin propuestas"
          description="Sube PDFs con las propuestas hechas a este cliente."
        />
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-start gap-3 py-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <a
                    href={p.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline"
                  >
                    {p.title}
                  </a>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {formatDate(p.created_at)}
                    </span>
                    {p.rep_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {p.rep_name}
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(p.id, p.file_url)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir propuesta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Nombre / descripción</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ej. Propuesta vinos premium Q3 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">Archivo PDF</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf"
                ref={fileRef}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!file || !title.trim() || pending}
                onClick={handleUpload}
              >
                Subir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
