"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PenLine, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const BLANK = "________________";

type BlankField = {
  index: number;      // posición ordinal en el texto
  before: string;     // contexto izquierdo (~60 chars)
  after: string;      // contexto derecho (~60 chars)
  value: string;
};

function extractBlanks(content: string): BlankField[] {
  const fields: BlankField[] = [];
  let search = 0;
  let i = 0;
  while (true) {
    const pos = content.indexOf(BLANK, search);
    if (pos === -1) break;
    const before = content.slice(Math.max(0, pos - 70), pos).replace(/\n/g, " ").trimStart();
    const after = content.slice(pos + BLANK.length, pos + BLANK.length + 70).replace(/\n/g, " ").trimEnd();
    fields.push({ index: i++, before, after, value: "" });
    search = pos + BLANK.length;
  }
  return fields;
}

function fillBlanks(content: string, fields: BlankField[]): string {
  let result = content;
  // Reemplazar de derecha a izquierda para no corromper los índices.
  let search = 0;
  let fi = 0;
  const positions: { pos: number; value: string }[] = [];
  while (fi < fields.length) {
    const pos = result.indexOf(BLANK, search);
    if (pos === -1) break;
    positions.push({ pos, value: fields[fi].value.trim() || BLANK });
    search = pos + BLANK.length;
    fi++;
  }
  // Aplicar de atrás para adelante.
  for (let i = positions.length - 1; i >= 0; i--) {
    const { pos, value } = positions[i];
    result = result.slice(0, pos) + value + result.slice(pos + BLANK.length);
  }
  return result;
}

export function CompletarDocumentoForm({
  docId,
  content,
}: {
  docId: string;
  content: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const initial = useMemo(() => extractBlanks(content), [content]);
  const [fields, setFields] = useState<BlankField[]>(initial);

  const blankCount = useMemo(() => (content.match(/________________/g) ?? []).length, [content]);

  if (blankCount === 0) return null;

  function updateField(index: number, value: string) {
    setFields((prev) => prev.map((f) => (f.index === index ? { ...f, value } : f)));
  }

  function save() {
    startTransition(async () => {
      const filled = fillBlanks(content, fields);
      const res = await fetch(`/api/documentos/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: filled }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Error al guardar", { description: d.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Documento actualizado");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-amber-900">
              {blankCount === 1
                ? "Hay 1 campo por completar en este documento."
                : `Hay ${blankCount} campos por completar en este documento.`}
            </p>
            <p className="text-xs text-amber-700">
              Llena los datos faltantes antes de finalizar o enviar.
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 border-amber-300 bg-white" onClick={() => setOpen(true)}>
            <PenLine className="mr-1.5 h-4 w-4" />
            Completar campos
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base">Completar campos faltantes</h2>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>

        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.index} className="space-y-1.5">
              {/* Contexto como etiqueta */}
              <label className="block text-xs text-muted-foreground leading-snug">
                {f.before.length > 0 && (
                  <span className="text-foreground/60">…{f.before.slice(-55)}</span>
                )}
                <span className="mx-1 font-semibold text-amber-700">[campo {f.index + 1}]</span>
                {f.after.length > 0 && (
                  <span className="text-foreground/60">{f.after.slice(0, 55)}…</span>
                )}
              </label>
              <Input
                placeholder="Escribe el valor para este campo"
                value={f.value}
                onChange={(e) => updateField(f.index, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Los campos que dejes vacíos seguirán como línea en blanco en el documento.
          </p>
          <Button onClick={save} disabled={pending}>
            <Check className="mr-1.5 h-4 w-4" />
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
