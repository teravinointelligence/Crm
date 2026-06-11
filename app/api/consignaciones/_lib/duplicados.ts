// Detector de consignaciones potencialmente duplicadas.
//
// Criterio: mismo cliente + mismo vendedor + misma fecha + mismo total.
// "Mismo cliente" se compara por NOMBRE NORMALIZADO (no por cliente_id),
// porque el origen real del problema son clientes duplicados en Base44
// (ej. LA QUERENCIA existe 2 veces con ids distintos).
//
// Solo DETECTA y agrupa — nunca decide cuál conservar; eso es del humano.
// Función pura sin imports pesados: se prueba directo con `node --test`.

// Extensión .ts explícita: este módulo también se importa desde node --test
// (type stripping), que exige la ruta completa. Next/webpack la resuelve igual.
import { normalizarNombre } from "./match-toma.ts";

export type ConsignacionDupInput = {
  id: string;
  cliente_nombre?: string;
  vendedor_id?: string;
  fecha?: string;
  total?: number;
  archivada?: boolean;
};

export type GrupoDuplicados<T extends ConsignacionDupInput> = {
  /** Clave humana del grupo: "querencia · 2026-05-05 · $0" */
  clave: string;
  consignaciones: T[];
};

/**
 * Agrupa consignaciones idénticas en (cliente normalizado, vendedor, fecha,
 * total) y devuelve solo los grupos con 2 o más. Las archivadas se excluyen:
 * ya fueron resueltas.
 */
export function detectarDuplicadas<T extends ConsignacionDupInput>(
  consignaciones: T[],
): GrupoDuplicados<T>[] {
  const grupos = new Map<string, T[]>();
  for (const c of consignaciones) {
    if (c.archivada) continue;
    const nombre = normalizarNombre(c.cliente_nombre).join(" ");
    if (!nombre) continue; // sin nombre no hay forma confiable de agrupar
    const clave = [nombre, c.vendedor_id ?? "", c.fecha ?? "", Number(c.total ?? 0)].join(" · ");
    const arr = grupos.get(clave);
    if (arr) arr.push(c);
    else grupos.set(clave, [c]);
  }
  return Array.from(grupos.entries())
    .filter(([, arr]) => arr.length >= 2)
    .map(([clave, consignaciones]) => ({ clave, consignaciones }));
}

/** Ids de todas las consignaciones que caen en algún grupo de duplicados. */
export function idsEnDuplicados<T extends ConsignacionDupInput>(grupos: GrupoDuplicados<T>[]): Set<string> {
  const ids = new Set<string>();
  for (const g of grupos) for (const c of g.consignaciones) ids.add(c.id);
  return ids;
}
