import { Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fraseDelDia } from "@/config/frases-ventas";

/** Frase motivacional del día (libros clásicos de ventas). Rota a medianoche. */
export function FraseDelDia() {
  const frase = fraseDelDia();
  return (
    <Card className="border-brand-carmesi/20 bg-brand-carmesi/5">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-carmesi text-white">
          <Quote className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base italic leading-snug">
            “{frase.texto}”
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            — {frase.autor}
            {frase.fuente ? `, ${frase.fuente}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
