"use client";

import { useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromocionForm } from "./PromocionForm";

export function PromocionesHeader({
  isAdmin,
  products,
  repId,
}: {
  isAdmin: boolean;
  products: { id: string; name: string; supplier: string | null }[];
  repId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-brand-carmesi" />
          <div>
            <h1 className="font-display text-3xl">Promociones y bonificaciones</h1>
            <p className="text-sm text-muted-foreground">
              Anuncios de temporada, descuentos y bonificaciones por vino
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva promoción
          </Button>
        )}
      </div>

      <PromocionForm
        open={open}
        onClose={() => setOpen(false)}
        products={products}
        repId={repId}
      />
    </>
  );
}
