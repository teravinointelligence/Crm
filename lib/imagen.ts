// Compresión de fotos en el navegador antes de subirlas.
//
// Las fotos que salen del álbum del celular vienen a resolución completa (8–15 MB
// no es raro) y las rutas API de Vercel rechazan cuerpos de más de ~4.5 MB con un
// 413 que ni siquiera trae JSON. Para evidencias (facturas firmadas) no hace falta
// esa resolución: reescalamos el lado mayor y re-codificamos a JPEG.
//
// Todo es best-effort: si el navegador no puede decodificar la imagen (p. ej. HEIC
// en Android), se devuelve el archivo original y la validación de tamaño decide.

const MAX_LADO = 2000;
const CALIDAD = 0.82;

async function cargarBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Algunos formatos (HEIC en Android) no se pueden decodificar; probamos con <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function comprimirImagen(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  const fuente = await cargarBitmap(file);
  if (!fuente) return file;

  const ancho = "width" in fuente ? fuente.width : 0;
  const alto = "height" in fuente ? fuente.height : 0;
  if (!ancho || !alto) return file;

  const escala = Math.min(1, MAX_LADO / Math.max(ancho, alto));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(fuente as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CALIDAD),
  );
  // Si la recodificación no ayuda (imagen ya pequeña), nos quedamos con la original.
  if (!blob || blob.size >= file.size) return file;

  const nombre = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${nombre}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}
