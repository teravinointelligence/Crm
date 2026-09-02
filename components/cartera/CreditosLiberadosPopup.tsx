"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, FileCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CreditoLiberadoPopupItem = {
  accountId: string;
  nombre: string;
  clientNumber: string | null;
  vendedor: string | null;
};

export function CreditosLiberadosPopup({
  items,
  repKey,
  facturista,
}: {
  items: CreditoLiberadoPopupItem[];
  repKey: string;
  facturista: boolean;
}) {
  const [open, setOpen] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signature = useMemo(
    () => items.map((item) => item.accountId).sort().join("|"),
    [items],
  );
  const storageKey = `teravino:creditos-liberados:v1:${repKey}:${signature}`;

  useEffect(() => {
    if (!items.length) return;
    try {
      if (window.sessionStorage.getItem(storageKey) === "seen") return;
    } catch {
      // El anuncio sigue disponible aunque el navegador restrinja el storage.
    }

    const showWhenAvailable = () => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        retryTimer.current = setTimeout(showWhenAvailable, 750);
        return;
      }
      setOpen(true);
    };
    retryTimer.current = setTimeout(showWhenAvailable, 1_250);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [items.length, storageKey]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      try {
        window.sessionStorage.setItem(storageKey, "seen");
      } catch {
        // El cierre nunca depende del almacenamiento del navegador.
      }
    }
  }

  if (!items.length) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-emerald-200 bg-brand-crema p-0 sm:max-w-2xl">
        <div className="border-b border-emerald-200 bg-white px-6 pb-5 pt-7">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                {facturista ? <FileCheck2 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
              </div>
              <div>
                <DialogTitle className="text-2xl text-brand-tinta">
                  Créditos liberados
                </DialogTitle>
                <DialogDescription className="mt-1 leading-relaxed">
                  {facturista
                    ? `${items.length} cuentas pagaron una factura vencida y pueden facturarse a crédito.`
                    : `${items.length} de tus cuentas pagaron una factura vencida y tienen el crédito liberado.`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-3 px-6 py-5">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Nueva regla: el crédito se libera al pagar una factura vencida durante los
            últimos 30 días. Otros abonos no liberan el crédito.
          </p>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <Link
                key={item.accountId}
                href={`/cuentas/${item.accountId}`}
                onClick={() => handleOpenChange(false)}
                className="group flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-brand-tinta">
                    {item.nombre}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {item.clientNumber ? `Cliente ${item.clientNumber}` : "Cuenta CRM"}
                    {facturista && item.vendedor ? ` · ${item.vendedor}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                  Liberado <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <DialogFooter className="border-t border-emerald-200 bg-white px-6 py-4 sm:justify-between">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Entendido
          </Button>
          <Button asChild onClick={() => handleOpenChange(false)}>
            <Link href={facturista ? "/reparto/credito" : "/cartera"}>
              Ver cuentas liberadas
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
