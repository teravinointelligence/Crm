// Registro de entrega por el chofer: sube la foto de la factura firmada como
// evidencia y marca el pedido como "entregado". La foto se puede tomar con la
// cámara o elegir del álbum de fotos del celular.
//
// La subida va directa a Supabase Storage con una URL firmada que emite el
// servidor: el cuerpo de una ruta API en Vercel no puede pasar de ~4.5 MB y una
// foto de álbum a resolución completa lo supera (la petición se rechazaba en el
// borde, sin llegar a la función). Aun así reescalamos la imagen antes de
// mandarla, para que el chofer no gaste datos de más. Con la foto ya en storage,
// POST /api/reparto/pedidos/[id]/entregar registra la entrega.

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CheckCircle2, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { comprimirImagen } from "@/lib/imagen";
import { createClient } from "@/lib/supabase/client";

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

const MAX_SUBIDA = 25 * 1024 * 1024;

export function RegistrarEntrega({ pedidoId }: { pedidoId: string }) {
  const router = useRouter();
  const supabase = createClient();
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
    if (f.size > MAX_SUBIDA) {
      toast.error("La imagen supera 25 MB.");
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
      // Reescalado en el navegador: una foto de álbum a resolución completa son
      // varios MB que el chofer subiría con datos móviles sin necesidad.
      const foto = await comprimirImagen(file);

      // 1. URL firmada para subir directo a storage (sin pasar por la ruta API).
      const resUrl = await fetch(`/api/reparto/pedidos/${pedidoId}/entregar/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: foto.type }),
      });
      const firma = (await resUrl.json().catch(() => ({}))) as {
        path?: string;
        token?: string;
        error?: string;
      };
      if (!resUrl.ok || !firma.path || !firma.token) {
        toast.error(firma.error ?? `No se pudo preparar la subida (error ${resUrl.status}).`);
        return;
      }

      // 2. Subida de la foto.
      const { error: upErr } = await supabase.storage
        .from("evidencias")
        .uploadToSignedUrl(firma.path, firma.token, foto, { contentType: foto.type });
      if (upErr) {
        toast.error(`No se pudo subir la foto: ${upErr.message}`);
        return;
      }

      // 3. Registro de la entrega con la ruta de la foto ya subida.
      const pos = await getPosicion();
      const res = await fetch(`/api/reparto/pedidos/${pedidoId}/entregar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          foto_path: firma.path,
          observaciones: observaciones.trim() || undefined,
          lat: pos?.lat,
          lng: pos?.lng,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? `No se pudo registrar la entrega (error ${res.status}).`);
        return;
      }
      toast.success("Entrega registrada con evidencia.");
      clearFoto();
      setObservaciones("");
      router.refresh();
    });
  };

  return (
    <Card id="registrar-entrega" className="scroll-mt-6">
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
