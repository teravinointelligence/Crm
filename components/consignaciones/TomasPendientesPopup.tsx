"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VendedorTomasGroup } from "@/lib/tomas-inventario-email";

function ultimaTomaLabel(ultimaToma: string | null, diasSinToma: number | null): string {
  if (!ultimaToma || diasSinToma === null) return "Sin toma registrada";
  const date = new Date(ultimaToma);
  if (!Number.isFinite(date.getTime())) return "Fecha pendiente de validar";
  return `Última toma: ${new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)}`;
}

function urgenciaClass(diasSinToma: number | null): string {
  if (diasSinToma === null || diasSinToma > 30) {
    return "border-red-200 bg-red-100 text-red-700";
  }
  return "border-amber-200 bg-amber-100 text-amber-700";
}

function urgenciaLabel(diasSinToma: number | null): string {
  return diasSinToma === null ? "Sin toma" : `${diasSinToma}d`;
}

export function TomasPendientesPopup({
  groups,
  isAdmin,
  repName,
  repKey,
}: {
  groups: VendedorTomasGroup[];
  isAdmin: boolean;
  repName: string;
  repKey: string;
}) {
  const [open, setOpen] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsCount = groups.reduce((total, group) => total + group.items.length, 0);
  const signature = useMemo(
    () =>
      groups
        .flatMap((group) => group.items.map((item) => `${item.consignacionId}:${item.ultimaToma ?? "nunca"}`))
        .sort()
        .join("|"),
    [groups],
  );
  const storageKey = `teravino:tomas-pendientes:${repKey}:${signature}`;

  useEffect(() => {
    if (!itemsCount) return;
    try {
      if (window.sessionStorage.getItem(storageKey) === "seen") return;
    } catch {
      // El aviso sigue funcionando aunque sessionStorage no esté disponible.
    }

    const showWhenAvailable = () => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        retryTimer.current = setTimeout(showWhenAvailable, 750);
        return;
      }
      setOpen(true);
    };
    retryTimer.current = setTimeout(showWhenAvailable, 500);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [itemsCount, storageKey]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      try {
        window.sessionStorage.setItem(storageKey, "seen");
      } catch {
        // No bloqueamos el cierre si el navegador restringe el almacenamiento.
      }
    }
  }

  if (!itemsCount) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-brand-carmesi/20 bg-brand-crema p-0 sm:max-w-xl">
        <div className="border-b border-brand-carmesi/15 bg-white px-6 pb-5 pt-7">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-2xl text-brand-tinta">
                  Tomas de inventario pendientes
                </DialogTitle>
                <DialogDescription className="mt-1 leading-relaxed">
                  {isAdmin
                    ? `${itemsCount} clientes del equipo llevan 14 días o más sin actualizar su inventario.`
                    : `Hola ${repName}, tienes ${itemsCount} ${itemsCount === 1 ? "cliente" : "clientes"} con inventario pendiente.`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          {groups.map((group) => (
            <section key={group.vendedorId}>
              {(isAdmin || groups.length > 1) && (
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="h-4 w-4 text-brand-carmesi" />
                  {group.vendedorNombre}
                </div>
              )}
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.consignacionId}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{item.cliente}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ultimaTomaLabel(item.ultimaToma, item.diasSinToma)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${urgenciaClass(item.diasSinToma)}`}
                    >
                      {urgenciaLabel(item.diasSinToma)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <DialogFooter className="gap-2 border-t border-brand-carmesi/15 bg-white px-6 py-4 sm:justify-between">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Entendido
          </Button>
          <Button asChild onClick={() => handleOpenChange(false)}>
            <Link href="/consignaciones/tomas">Ver y actualizar inventarios</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
