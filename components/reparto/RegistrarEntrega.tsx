// Registro de entrega por el chofer: sube la foto de la factura firmada como
// evidencia y marca el pedido como "entregado". La foto se puede tomar con la
// cámara o elegir del álbum de fotos del celular. El archivo se manda al
// endpoint server-side (POST /api/reparto/pedidos/[id]/entregar), que lo sube
// con service_role y crea el registro en reparto.entregas.

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CheckCircle2, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

// Geolocalización best-effort: si el chofer la concede, deja constancia del
// punto de entrega; si la rechaza o falla, igual se registra la entrega.
function getPosicion(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  });
}

// Algunos álbumes de Android/iOS entregan el archivo sin MIME type; en ese caso
// nos apoyamos en la extensión para no rechazar una foto válida.
const EXT_IMAGEN = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;
function esImagen(f: File) {
  return f.type ? f.type.startsWith("image/") : EXT_IMAGEN.test(f.name);
}

export function RegistrarEntrega({ pedidoId }: { pedidoId: string }) {
  const router = useRouter();
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [pending, startTransition] = useTransition();

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!esImagen(f)) {
      toast.error("Sube una imagen (foto de la factura firmada).");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("La imagen supera 10 MB.");
      return;
    }
    setFile(f);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const clearFoto = () => {
    setFile(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const submit = () => {
    if (!file) {
      toast.error("Falta la foto de la factura firmada.");
      return;
    }
    startTransition(async () => {
      const pos = await getPosicion();
      const fd = new FormData();
      fd.append("foto", file);
      if (observaciones.trim()) fd.append("observaciones", observaciones.trim());
      if (pos) {
        fd.append("lat", String(pos.lat));
        fd.append("lng", String(pos.lng));
      }
      const res = await fetch(`/api/reparto/pedidos/${pedidoId}/entregar`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo registrar la entrega.");
        return;
      }
      toast.success("Entrega registrada con evidencia.");
      clearFoto();
      setObservaciones("");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1">
          <h3 className="font-display text-lg">Registrar entrega</h3>
          <p className="text-sm text-muted-foreground">
            Toma una foto de la factura firmada por el cliente o elígela del álbum de fotos del
            celular. Al guardar, el pedido queda marcado como <strong>entregado</strong>.
          </p>
        </div>

        {/* Cámara: `capture` abre directo el visor del celular. */}
        <input
          ref={camaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />
        {/* Galería: sin `capture`, el celular abre el álbum de fotos. */}
        <input ref={galeriaRef} type="file" accept="image/*" className="hidden" onChange={onPick} />

        {preview ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Factura firmada" className="h-48 rounded-md border object-cover" />
            <button
              type="button"
              onClick={clearFoto}
              disabled={pending}
              className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow border hover:bg-muted"
              aria-label="Quitar foto"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => camaraRef.current?.click()}
            disabled={pending}
          >
            <Camera className="mr-2 h-4 w-4" />
            {preview ? "Tomar otra foto" : "Tomar foto de la factura firmada"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => galeriaRef.current?.click()}
            disabled={pending}
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            {preview ? "Elegir otra de la galería" : "Elegir foto de la galería"}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Observaciones (opcional): quién recibió, detalles de la entrega…"
            disabled={pending}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || !file}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {pending ? "Guardando…" : "Marcar como entregado"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
