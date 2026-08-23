"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Sparkles, Store, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PersonalIncentiveConfig } from "@/lib/personal-incentives";

export function PersonalIncentiveAnnouncement({
  config,
}: {
  config: PersonalIncentiveConfig;
}) {
  const [open, setOpen] = useState(false);
  const storageKey = `teravino:personal-incentive:${config.key}:2026-q4:v1`;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) !== "seen") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      try {
        window.localStorage.setItem(storageKey, "seen");
      } catch {
        // El aviso sigue disponible aunque el navegador bloquee localStorage.
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-brand-oro/50 bg-brand-crema p-0 sm:max-w-lg">
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-carmesi via-brand-carmesi-dark to-brand-tinta px-6 pb-7 pt-8 text-white">
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
                {config.firstName}, {config.announcementTitle}
              </DialogTitle>
              <DialogDescription className="pt-1 text-sm leading-relaxed text-white/80">
                {config.announcementBody}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-brand-oro/40 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tu reconocimiento</p>
            <p className="mt-1 font-display text-xl text-brand-tinta">{config.recognition}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {config.actionChallenge ? (
              <div className="rounded-xl border border-brand-oro/40 bg-white p-3">
                <Store className="mb-2 h-5 w-5 text-brand-carmesi" />
                <p className="text-xs text-muted-foreground">Apertura + reactivación pagadas</p>
                <p className="font-display text-xl text-brand-tinta">Hasta $3,000</p>
              </div>
            ) : (
              <div className="rounded-xl border border-brand-oro/40 bg-white p-3">
                <Target className="mb-2 h-5 w-5 text-brand-carmesi" />
                <p className="text-xs text-muted-foreground">Tu meta personal</p>
                <p className="font-display text-xl text-brand-tinta">Vallarta</p>
              </div>
            )}
            <div className="rounded-xl border border-brand-oro/40 bg-white p-3">
              <Banknote className="mb-2 h-5 w-5 text-brand-carmesi" />
              <p className="text-xs text-muted-foreground">Reto de cobranza</p>
              <p className="font-display text-xl text-brand-tinta">Hasta $3,000</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Las aperturas y reactivaciones solo liberan incentivo cuando la compra está
            completamente pagada. En cobranza únicamente cuentan pagos confirmados y aplicados.
          </p>
        </div>

        <DialogFooter className="flex-col gap-3 border-t border-brand-oro/30 bg-white px-6 py-4 sm:flex-row sm:justify-between sm:gap-2">
          <p className="self-center text-xs text-muted-foreground">
            Piloto: septiembre–noviembre 2026
          </p>
          <Button asChild onClick={() => handleOpenChange(false)}>
            <Link href="/incentivos">Ver mis incentivos</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
