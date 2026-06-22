"use client";

// Botón "Enviar a clientes" en la tarjeta de una promoción. Abre un diálogo con
// el buscador de clientes (cuentas visibles con correo), correos extra y un
// enlace para ver el flyer PDF que se adjunta. Envía el PDF por correo (BCC).

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, FileDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type CarteraStatus = "al_corriente" | "vencido" | null;
type Cliente = { id: string; name: string; email: string; cartera: CarteraStatus };

const CARTERA_ALL = "_all";

export function EnviarPromoButton({ promoId }: { promoId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [cartera, setCartera] = useState<string>(CARTERA_ALL);
  const [extra, setExtra] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!clientes) return [];
    return clientes.filter((c) => {
      if (cartera !== CARTERA_ALL && (c.cartera ?? "") !== cartera) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, query, cartera]);

  const extraEmails = useMemo(
    () =>
      extra
        .split(/[\s,;]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@")),
    [extra],
  );

  const total = selected.size + extraEmails.length;

  const openDialog = () => {
    setOpen(true);
    if (clientes) return;
    startTransition(async () => {
      const res = await fetch(`/api/promociones/${promoId}/enviar`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo cargar la lista de clientes", { description: data.error ?? `HTTP ${res.status}` });
        setOpen(false);
        return;
      }
      setClientes(Array.isArray(data.clientes) ? data.clientes : []);
    });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAllFiltered = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allFilteredSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });

  const send = () => {
    if (total === 0) return;
    startTransition(async () => {
      const res = await fetch(`/api/promociones/${promoId}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: Array.from(selected), extraEmails }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo enviar", { description: data.error ?? `HTTP ${res.status}` });
        return;
      }
      toast.success("Promoción enviada", { description: `A ${data.count} cliente${data.count === 1 ? "" : "s"}` });
      setOpen(false);
      setSelected(new Set());
      setExtra("");
      setQuery("");
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} disabled={pending}>
        <Send className="mr-1 h-3.5 w-3.5" />
        Enviar a clientes
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar promoción a clientes</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <a
              href={`/api/promociones/${promoId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-brand-carmesi hover:underline"
            >
              <FileDown className="mr-1 h-3.5 w-3.5" />
              Ver el flyer PDF que se adjuntará
            </a>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar cliente por nombre o correo…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select value={cartera} onValueChange={setCartera}>
                <SelectTrigger className="w-40 shrink-0">
                  <SelectValue placeholder="Cartera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CARTERA_ALL}>Toda la cartera</SelectItem>
                  <SelectItem value="al_corriente">Al corriente</SelectItem>
                  <SelectItem value="vencido">Con saldo vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {clientes === null ? (
              <p className="py-6 text-center text-muted-foreground">Cargando clientes…</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {filtered.length} cliente{filtered.length === 1 ? "" : "s"} con correo
                  </span>
                  {filtered.length > 0 && (
                    <button type="button" className="text-brand-carmesi hover:underline" onClick={toggleAllFiltered}>
                      {allFilteredSelected ? "Quitar todos" : "Seleccionar todos"}
                    </button>
                  )}
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-muted/20 p-2">
                  {filtered.length === 0 && (
                    <li className="px-1 py-3 text-center text-muted-foreground">Sin coincidencias.</li>
                  )}
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-carmesi"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{c.name}</span>
                            {c.cartera === "al_corriente" && (
                              <Badge variant="success" className="shrink-0">
                                Al corriente
                              </Badge>
                            )}
                            {c.cartera === "vencido" && (
                              <Badge variant="danger" className="shrink-0">
                                Con vencido
                              </Badge>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Otros correos (opcional, separa con coma)</label>
              <Textarea
                rows={2}
                placeholder="correo@ejemplo.com, otro@ejemplo.com"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Los clientes van en copia oculta (BCC); no se ven entre ellos.
            </p>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={send} disabled={pending || total === 0}>
                <Send className="mr-1 h-4 w-4" />
                {pending ? "Enviando…" : total === 0 ? "Elige clientes" : `Enviar a ${total}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
