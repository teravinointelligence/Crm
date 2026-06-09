// Helper compartido por las rutas /api/flota/* para convertir el body JSON en un
// patch limpio: strings recortados ("" → null en update, omitido en create) y
// números validados. Server-side; sin dependencias de red.

export type ParseResult<T> = { data: Partial<T> } | { error: string };

type Options = {
  // En create omitimos los vacíos; en update los mandamos como null para limpiar.
  blankToNull: boolean;
};

export function parsePayload<T>(
  body: Record<string, unknown>,
  stringFields: readonly string[],
  numberFields: readonly string[],
  opts: Options,
): ParseResult<T> {
  const data: Record<string, unknown> = {};

  for (const key of stringFields) {
    if (!(key in body)) continue;
    const raw = body[key];
    const val = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
    if (val === "") {
      if (opts.blankToNull) data[key] = null;
    } else {
      data[key] = val;
    }
  }

  for (const key of numberFields) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === "" || raw == null) {
      if (opts.blankToNull) data[key] = null;
    } else {
      const num = Number(raw);
      if (Number.isNaN(num)) return { error: `El campo ${key} debe ser numérico` };
      data[key] = num;
    }
  }

  return { data: data as Partial<T> };
}
