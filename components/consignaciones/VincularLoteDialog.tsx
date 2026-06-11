"use client";

// Vinculación POR LOTES de tomas huérfanas. Reglas duras:
//   - Solo son seleccionables las tomas con EXACTAMENTE UNA candidata.
//   - Las ambiguas (2+ candidatas, ej. LA QUERENCIA duplicada) se muestran
//     deshabilitadas como "Requiere decisión manual" — se resuelven una por
//     una con el dialog individual.
//   - NADA viene pre-seleccionado y hay confirmación en dos pasos: marcar →
//     revisar el resumen → confirmar. Cada vinculación llama al endpoint
//     existente /api/consignaciones/tomas/[id]/vincular (que deja bitácora en
//     la toma Y en la consignación).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Link2, ListChecks, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { CandidataVinculo } from "./VincularTomaDialog";

export type TomaLoteItem = {
  tomaId: string;
  tomaLabel: string;
  fechaToma: string;
  clienteNombre: string;
  vendedorNombre: string;
  /** "unica" = elegible para el lote; "ambigua"/"sin_candidata" = fuera del lote. */
  clasificacion: "unica" | "ambigua" | "sin_candidata";
  /** Presente solo cuando clasificacion === "unica". */
  candidata?: CandidataVinculo;
  /** Cuántas candidatas hay (para el mensaje de "Requiere decisión manual"). */
  numCandidatas: number;
};

type Resultado = { tomaId: string; ok: boolean; detalle?: string };

type Props = { items: TomaLoteItem[] };

export function VincularLoteDialog({ items }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<"seleccion" | "confirmacion" | "resultado">("seleccion");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [pending, startTransition] = useTransition();

  const elegibles = useMemo(() => items.filter((i) => i.clasificacion === "unica"), [items]);
  const seleccionadas = useMemo(
    () => elegibles.filter((i) => seleccion.has(i.tomaId)),
    [elegibles, seleccion],
  );

  const toggle = (tomaId: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(tomaId)) next.delete(tomaId);
      else next.add(tomaId);
      return next;
    });

  const reset = () => {
    setPaso("seleccion");
    setSeleccion(new Set());
    setResultados([]);
  };

  const confirmar = () => {
    startTransition(async () => {
      const res: Resultado[] = [];
      // Secuencial a propósito: cada vinculación valida scope/409 en el server
      // y queremos un resultado claro por fila, no una ráfaga parcial.
      for (const item of seleccionadas) {
        try {
          const r = await fetch(`/api/consignaciones/tomas/${item.tomaId}/vincular`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ consignacion_id: item.candidata!.id }),
          });
          if (r.ok) {
            const data = (await r.json()) as { warning?: string };
            res.push({ tomaId: item.tomaId, ok: true, detalle: data.warning });
          } else {
            const data = await r.json().catch(() => ({} as { error?: string }));
            res.push({ tomaId: item.tomaId, ok: false, detalle: data.error ?? `HTTP ${r.status}` });
          }
        } catch (e) {
          res.push({ tomaId: item.tomaId, ok: false, detalle: e instanceof Error ? e.message : "Error de red" });
        }
      }
      setResultados(res);
      setPaso("resultado");
      const okCount = res.filter((r) => r.ok).length;
      if (okCount > 0) {
        toast.success(`${okCount} toma${okCount === 1 ? "" : "s"} vinculada${okCount === 1 ? "" : "s"}`);
        router.refresh();
      }
      if (okCount < res.length) {
        toast.error(`${res.length - okCount} vinculación(es) fallaron — revisa el detalle`);
      }
    });
  };

  const porId = useMemo(() => new Map(items.map((i) => [i.tomaId, i])), [items]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ListChecks className="mr-1 h-3.5 w-3.5" />
          Vincular varias…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular tomas huérfanas por lote</DialogTitle>
          <DialogDescription>
            Solo se pueden incluir en el lote las tomas con <strong>una sola</strong> consignación
            candidata. Las que tienen varias requieren decisión manual (botón “Vincular” de su
            fila). Nada se vincula sin tu confirmación.
          </DialogDescription>
        </DialogHeader>

        {paso === "seleccion" && (
          <>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-left">Toma</th>
                    <th className="px-3 py-2 text-left">Candidata sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const elegible = item.clasificacion === "unica";
                    const marcada = seleccion.has(item.tomaId);
                    return (
                      <tr key={item.tomaId} className={elegible ? "border-t" : "border-t opacity-70"}>
                        <td className="px-3 py-2 text-center">
                          <Checkbox
                            checked={marcada}
                            disabled={!elegible || pending}
                            onCheckedChange={() => toggle(item.tomaId)}
                            aria-label={`Seleccionar ${item.tomaLabel}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.tomaLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.clienteNombre} · {item.vendedorNombre} · {formatDate(item.fechaToma)}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          {item.clasificacion === "unica" && item.candidata ? (
                            <div>
                              <p>{item.candidata.cliente_nombre}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(item.candidata.fecha)} · {item.candidata.vendedor_nombre} ·{" "}
                                {formatCurrency(item.candidata.total)} · {item.candidata.estado}
                              </p>
                            </div>
                          ) : item.clasificacion === "ambigua" ? (
                            <div>
                              <Badge variant="warning">Requiere decisión manual</Badge>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.numCandidatas} consignaciones candidatas — resuélvela con el
                                botón “Vincular” de su fila.
                              </p>
                            </div>
                          ) : (
                            <Badge variant="muted">Sin candidata</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={seleccionadas.length === 0} onClick={() => setPaso("confirmacion")}>
                Vincular seleccionadas ({seleccionadas.length})
              </Button>
            </DialogFooter>
          </>
        )}

        {paso === "confirmacion" && (
          <>
            <div className="space-y-2">
              <p className="text-sm">
                Vas a vincular <strong>{seleccionadas.length}</strong> toma
                {seleccionadas.length === 1 ? "" : "s"}. Revisa el resumen — esta acción escribe en
                TERAVINO Flow y queda registrada con tu nombre:
              </p>
              <ul className="max-h-60 space-y-1.5 overflow-y-auto rounded-md border p-3 text-sm">
                {seleccionadas.map((s) => (
                  <li key={s.tomaId} className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      <strong>{s.tomaLabel}</strong> → {s.candidata!.cliente_nombre} (
                      {formatDate(s.candidata!.fecha)} · {formatCurrency(s.candidata!.total)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaso("seleccion")} disabled={pending}>
                Volver
              </Button>
              <Button onClick={confirmar} disabled={pending}>
                {pending ? "Vinculando…" : `Confirmar vinculación (${seleccionadas.length})`}
              </Button>
            </DialogFooter>
          </>
        )}

        {paso === "resultado" && (
          <>
            <ul className="max-h-60 space-y-1.5 overflow-y-auto rounded-md border p-3 text-sm">
              {resultados.map((r) => {
                const item = porId.get(r.tomaId);
                return (
                  <li key={r.tomaId} className="flex items-start gap-2">
                    {r.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <span>
                      <strong>{item?.tomaLabel ?? r.tomaId}</strong>{" "}
                      {r.ok ? "vinculada" : "falló"}
                      {r.detalle ? ` — ${r.detalle}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Cerrar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
