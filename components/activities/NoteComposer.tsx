"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Building2, Loader2, StickyNote, User, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NoteTagKind } from "@/types/database";

type Sugerencia = {
  kind: NoteTagKind;
  id: string;
  name: string;
  accountId?: string | null;
  accountName?: string | null;
};

/** Espera antes de buscar, para no pegarle a la API en cada tecla. */
const DEBOUNCE_MS = 250;

export function NoteComposer() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<Sugerencia[]>([]);
  const [saving, startSaving] = useTransition();

  // Estado del buscador de @
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null); // null = cerrado
  const [results, setResults] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Lee el texto justo antes del cursor y decide si estamos escribiendo una
   * mención. Sirve para @ al inicio o después de un espacio; si el "@" quedó
   * pegado a una palabra (un correo, por ejemplo) no abre nada.
   */
  const detectMention = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const match = upto.match(/(?:^|\s)@([\p{L}\p{N}\s.'&-]{0,40})$/u);
    setQuery(match ? match[1] : null);
  };

  // Busca cuentas y contactos conforme se escribe la mención.
  useEffect(() => {
    if (query === null || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/notas/buscar?q=${encodeURIComponent(query.trim())}`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        setResults([...(json.cuentas ?? []), ...(json.contactos ?? [])]);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const addTag = (s: Sugerencia) => {
    setTags((prev) =>
      prev.some((t) => t.kind === s.kind && t.id === s.id) ? prev : [...prev, s],
    );
    // Sustituye el "@loquesea" a medio escribir por el nombre elegido.
    const area = areaRef.current;
    if (area) {
      const caret = area.selectionStart ?? body.length;
      const before = body.slice(0, caret).replace(/@[\p{L}\p{N}\s.'&-]{0,40}$/u, "");
      const next = `${before}@${s.name} ${body.slice(caret)}`;
      setBody(next);
      const pos = before.length + s.name.length + 2;
      requestAnimationFrame(() => {
        area.focus();
        area.setSelectionRange(pos, pos);
      });
    }
    setQuery(null);
    setResults([]);
  };

  const removeTag = (s: Sugerencia) =>
    setTags((prev) => prev.filter((t) => !(t.kind === s.kind && t.id === s.id)));

  const save = () => {
    const text = body.trim();
    if (!text) return;
    startSaving(async () => {
      try {
        const res = await fetch("/api/notas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: text,
            tags: tags.map((t) => ({ kind: t.kind, id: t.id })),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          toast.error("No se pudo guardar la nota", { description: json.error });
          return;
        }
        setBody("");
        setTags([]);
        toast.success("Nota guardada");
        router.refresh();
      } catch (e) {
        toast.error("No se pudo guardar la nota", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  };

  const abierto = query !== null && query.trim().length >= 2;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="relative">
        <Textarea
          ref={areaRef}
          value={body}
          rows={3}
          placeholder="Escribe una nota… usa @ para etiquetar un cliente o un contacto."
          onChange={(e) => {
            setBody(e.target.value);
            detectMention(e.target.value, e.target.selectionStart ?? 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && abierto) {
              e.preventDefault();
              setQuery(null);
            }
            // Ctrl/Cmd + Enter guarda sin soltar el teclado.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          onClick={(e) => detectMention(body, e.currentTarget.selectionStart ?? 0)}
        />

        {abierto && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {loading && (
              <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
              </p>
            )}
            {!loading && results.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                Nada con “{query?.trim()}”
              </p>
            )}
            {results.map((s) => (
              <button
                key={`${s.kind}-${s.id}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // no robarle el foco al textarea
                onClick={() => addTag(s)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                {s.kind === "cuenta" ? (
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{s.name}</span>
                {s.kind === "contacto" && s.accountName && (
                  <span className="truncate text-xs text-muted-foreground">
                    · {s.accountName}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={`${t.kind}-${t.id}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                t.kind === "cuenta"
                  ? "border-brand-carmesi/30 bg-brand-carmesi/10 text-brand-carmesi"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {t.kind === "cuenta" ? (
                <Building2 className="h-3 w-3" />
              ) : (
                <User className="h-3 w-3" />
              )}
              {t.name}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Quitar etiqueta ${t.name}`}
                className="ml-0.5 rounded-full hover:bg-black/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <AtSign className="h-3 w-3" /> Escribe @ para etiquetar
        </p>
        <Button size="sm" onClick={save} disabled={saving || !body.trim()}>
          {saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <StickyNote className="mr-1 h-3.5 w-3.5" />
          )}
          Guardar nota
        </Button>
      </div>
    </div>
  );
}
