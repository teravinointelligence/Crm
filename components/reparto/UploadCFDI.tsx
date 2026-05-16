// Diálogo para subir XML o ZIP de CFDI 4.0 y crear pedidos automáticamente.

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type Outcome = {
  archivo: string;
  status: "creado" | "ya_existe" | "error";
  pedido_id?: string;
  numero_factura?: string;
  error?: string;
};
type Summary = {
  total: number;
  creados: number;
  ya_existen: number;
  errores: number;
  clientes_creados: number;
};

export function UploadCFDI() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [results, setResults] = useState<Outcome[]>([]);

  const reset = () => { setFiles([]); setSummary(null); setResults([]); if (inputRef.current) inputRef.current.value = ""; };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []));
    setSummary(null);
    setResults([]);
  };

  const upload = () => {
    if (!files.length) { toast.error("Selecciona archivos primero"); return; }
    startTransition(async () => {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/reparto/pedidos/upload-cfdi", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Error al subir"); return; }
      setSummary(json.summary);
      setResults(json.results ?? []);
      if (json.summary.creados > 0) {
        toast.success(`${json.summary.creados} pedido(s) creado(s)`);
        router.refresh();
      } else if (json.summary.ya_existen > 0) {
        toast.success("Todos los XML ya estaban cargados");
      } else {
        toast.error("Ningún XML pudo crear un pedido");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-1 h-4 w-4" /> Subir CFDI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar pedidos desde CFDI</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 text-center cursor-pointer hover:bg-muted/50">
            <FileSpreadsheet className="h-10 w-10 text-brand-carmesi" />
            <span className="font-medium">
              {files.length === 0 ? "Click para seleccionar XML o ZIP" : `${files.length} archivo(s) seleccionado(s)`}
            </span>
            <span className="text-xs text-muted-foreground">Acepta varios .xml o un .zip con XMLs adentro</span>
            <input ref={inputRef} type="file" accept=".xml,.zip,application/xml,application/zip" multiple className="hidden" onChange={handlePick} />
          </label>

          {files.length > 0 && !summary && (
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-card p-2 text-xs">
              {files.map((f, i) => <li key={i} className="text-muted-foreground">{f.name} <span className="text-foreground/40">({Math.round(f.size / 1024)} KB)</span></li>)}
            </ul>
          )}

          {summary && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Kpi label="Total" value={summary.total} />
                <Kpi label="Creados" value={summary.creados} tone={summary.creados > 0 ? "ok" : undefined} />
                <Kpi label="Ya existen" value={summary.ya_existen} />
                <Kpi label="Errores" value={summary.errores} tone={summary.errores > 0 ? "warn" : undefined} />
              </div>
              {summary.clientes_creados > 0 && (
                <p className="text-xs text-muted-foreground">+ {summary.clientes_creados} cliente(s) nuevo(s) creados automáticamente.</p>
              )}
              <details className="rounded-md border bg-muted/30 text-xs">
                <summary className="cursor-pointer p-2 font-medium">Detalle por archivo</summary>
                <ul className="max-h-56 space-y-1 overflow-y-auto p-2">
                  {results.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {r.status === "creado" && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                      {r.status === "ya_existe" && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      {r.status === "error" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                      <span>
                        <strong>{r.archivo}</strong> · {r.numero_factura ?? "—"} ·{" "}
                        <span className={r.status === "error" ? "text-amber-700" : "text-muted-foreground"}>
                          {r.status === "creado" ? "creado" : r.status === "ya_existe" ? "ya existía" : `error: ${r.error}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {summary ? (
              <Button onClick={() => { setOpen(false); reset(); }}>Cerrar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
                <Button onClick={upload} disabled={pending || files.length === 0}>
                  {pending ? "Procesando…" : `Importar ${files.length || ""}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const cls = tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-display text-xl ${cls}`}>{value}</p>
    </div>
  );
}
