// Rutas y tipos de las fotos de evidencia de entrega (bucket público
// `evidencias`). Módulo puro: lo usan tanto las rutas API como las pruebas.

// Extensiones aceptadas para la foto de evidencia y su content-type.
export const TIPO_POR_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  gif: "image/gif",
  bmp: "image/bmp",
};

export const EXT_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

// Las evidencias viven en `entregas/<pedido_id>_<timestamp>.<ext>` dentro del
// bucket público `evidencias`.
export function rutaEvidencia(pedidoId: string, ext: string) {
  return `entregas/${pedidoId}_${Date.now()}.${ext}`;
}

// El cliente nos devuelve la ruta que subió; solo aceptamos las del propio
// pedido para que nadie registre una entrega apuntando a otro archivo.
export function rutaValida(pedidoId: string, path: unknown): path is string {
  if (typeof path !== "string") return false;
  const id = pedidoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exts = Object.keys(TIPO_POR_EXT).join("|");
  return new RegExp(`^entregas/${id}_\\d+\\.(${exts})$`).test(path);
}
