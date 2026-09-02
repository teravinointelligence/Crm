// Deduce el almacén a partir del nombre del archivo de CONTPAQ.
//
// Los reportes "Inventario actual del almacén por producto" se bajan uno por
// bodega y el nombre lo escribe Sabrina a mano, así que varía:
//   "inventario v612 3 agosto.xls"        → V612
//   "inventario almacen v612 6 agosto.xls" → V612
//   "inventario bodega lap 5 ago.xls"      → La Paz
//   "inventario los cabos 22 jul.xls"      → Los Cabos
//
// Devuelve null cuando no hay bodega reconocible (p. ej. "inventario Nemi al 28
// mayo.xls", que es la toma de un cliente en consignación, no de un almacén) o
// cuando el nombre menciona dos bodegas distintas. El importador automático usa
// ese null para ignorar el archivo en vez de adivinar.

import type { Warehouse } from "@/lib/warehouses";

// Orden importante: el alias más específico primero dentro de cada bodega.
const ALIASES: { warehouse: Warehouse; aliases: string[] }[] = [
  { warehouse: "V612", aliases: ["v612", "v 612"] },
  { warehouse: "La Paz", aliases: ["la paz", "lapaz", "bodega lap", "lap", "paz"] },
  { warehouse: "Tijuana", aliases: ["tijuana", "tij", "tj"] },
  { warehouse: "Vallarta", aliases: ["puerto vallarta", "vallarta", "vta"] },
  { warehouse: "Los Cabos", aliases: ["los cabos", "cabos", "cabo", "csl"] },
];

export function normalizeFilename(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ¿El nombre normalizado contiene el alias como palabra(s) completa(s)?
// Match por límites de palabra para que "lap" no empate dentro de "vallarta"
// ni "cabo" dentro de otra palabra.
function hasAlias(normalized: string, alias: string): boolean {
  const padded = ` ${normalized} `;
  return padded.includes(` ${alias} `);
}

export function warehouseFromFilename(name: string): Warehouse | null {
  const normalized = normalizeFilename(name);
  if (!normalized) return null;

  const hits = new Set<Warehouse>();
  for (const { warehouse, aliases } of ALIASES) {
    if (aliases.some((a) => hasAlias(normalized, a))) hits.add(warehouse);
  }

  // Ambiguo (menciona dos bodegas) o sin bodega → no adivinamos.
  if (hits.size !== 1) return null;
  return [...hits][0];
}

// ¿El archivo parece un reporte de existencias por almacén? Se usa para filtrar
// la carpeta de Drive antes de mandar nada al importador.
export function looksLikeInventarioFile(name: string): boolean {
  const normalized = normalizeFilename(name);
  return (
    /\b(xls|xlsx)\b/.test(normalized) &&
    normalized.includes("inventario") &&
    warehouseFromFilename(name) !== null
  );
}
