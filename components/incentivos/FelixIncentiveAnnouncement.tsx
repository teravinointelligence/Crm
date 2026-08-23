"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Sparkles, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// v2 rearma el aviso después de la prueba administrativa del lanzamiento.
const STORAGE_KEY = "teravino:felix-incentive:2026-2027:announcement:v2";

export function FelixIncentiveAnnouncement() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "seen") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      try {
        window.localStorage.setItem(STORAGE_KEY, "seen");
      } catch {
        // El aviso sigue funcionando aunque el navegador bloquee el almacenamiento local.
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border-brand-oro/50 bg-brand-crema p-0 sm:max-w-lg">
        <div className="relative bg-gradient-to-br from-brand-carmesi via-brand-carmesi-dark to-brand-tinta px-6 pb-7 pt-8 text-white">
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand-oro/20 blur-2xl" />
          <div className="relative">
            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-oro text-brand-tinta shadow-lg">
              <Trophy className="h-7 w-7" />
            </div>
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-oro-soft">
                <Sparkles className="h-4 w-4" /> Nuevo incentivo desbloqueado
              </div>
              <DialogTitle className="text-3xl text-white">
                Félix, tu meta de Vallarta ya está lista
              </DialogTitle>
              <DialogDescription className="pt-1 text-sm leading-relaxed text-white/80">
                A partir del 1 de septiembre, cada avance en ventas y nuevas aperturas
                te acerca a un incentivo adicional.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-brand-oro/40 bg-white p-3">
              <Target className="mb-2 h-5 w-5 text-brand-carmesi" />
              <p className="text-xs text-muted-foreground">Meta mínima mensual</p>
              <p className="font-display text-xl text-brand-tinta">$400 mil</p>
            </div>
            <div className="rounded-xl border border-brand-oro/40 bg-white p-3">
              <CalendarDays className="mb-2 h-5 w-5 text-brand-carmesi" />
              <p className="text-xs text-muted-foreground">Meta saludable</p>
              <p className="font-display text-xl text-brand-tinta">$450 mil</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Mantienes tu comisión ordinaria de 3% y puedes sumar un acelerador
            progresivo, además de bonos por nuevas cuentas con recompra.
          </p>
        </div>

        <DialogFooter className="flex-col gap-3 border-t border-brand-oro/30 bg-white px-6 py-4 sm:flex-row sm:justify-between sm:gap-2">
          <p className="self-center text-xs text-muted-foreground">
            Vigencia: septiembre 2026–agosto 2027
          </p>
          <Button asChild onClick={() => handleOpenChange(false)}>
            <Link href="/incentivos">Ver mi incentivo</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
