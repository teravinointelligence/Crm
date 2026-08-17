// Lógica pura del puente Drive → inventario por almacén.
//
// Se mantiene SIN dependencias de servidor (nada de Supabase, Drive ni
// "server-only") para que sea testeable con `npm test`. El I/O vive en
// lib/google-drive.ts y la orquestación en lib/inventario-drive-sync.ts.

import { WAREHOUSES, type Warehouse } from "./warehouses";

export type DriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Cómo nombra el equipo cada almacén en los archivos que baja de CONTPAQi.
// Se comparan como palabra completa o frase completa (nunca subcadena suelta),
// para que "cab" no empate dentro de "cabos" ni "paz" dentro de otra palabra.
const WAREHOUSE_ALIASES: Record<Warehouse, string[]> = {
  "La Paz": ["la paz", "lapaz", "lap", "paz", "bodega lap"],
  V612: ["v612", "tienda v612"],
  Tijuana: ["tijuana", "tij"],
  Vallarta: ["vallarta", "vta", "pv", "puerto vallarta"],
  "Los Cabos": ["los cabos", "loscabos", "cabos", "cab", "sjd"],
};

// ¿El texto normalizado contiene el alias como palabra/frase completa?
function matchesAlias(text: string, alias: string): boolean {
  if (text === alias) return true;
  return (
    text.startsWith(alias + " ") ||
    text.endsWith(" " + alias) ||
    text.includes(" " + alias + " ")
  );
}

export type WarehouseMatch =
  | { warehouse: Warehouse; reason: null }
  | { warehouse: null; reason: string };

// Deduce el almacén a partir del nombre del archivo.
//
// Si el nombre empata con DOS almacenes (p. ej. "Traspaso Vallarta Tijuana"),
// devuelve null a propósito: adivinar ahí escribiría existencias en el almacén
// equivocado, y un inventario mal cargado es peor que uno no cargado.
export function warehouseFromFileName(name: string): WarehouseMatch {
  const text = normalize(name);
  const hits = WAREHOUSES.filter((w) =>
    WAREHOUSE_ALIASES[w].some((a) => matchesAlias(text, a)),
  );

  if (hits.length === 1) return { warehouse: hits[0], reason: null };
  if (hits.length === 0) {
    return { warehouse: null, reason: "No reconocí el almacén en el nombre del archivo" };
  }
  return {
    warehouse: null,
    reason: `El nombre menciona varios almacenes (${hits.join(", ")}); se omite por ambigüedad`,
  };
}

// ¿Es un archivo de inventario que vale la pena procesar?
//
// La carpeta de Drive es un cajón de sastre (PDFs, fotos, órdenes de compra,
// traspasos, reportes de ventas), así que el filtro es explícito: tiene que
// decir "inventario" y ser un Excel real.
export function isInventoryFile(name: string): boolean {
  if (name.startsWith("~$")) return false; // temporal de Excel
  if (!/\.xlsx?$/i.test(name)) return false;
  const text = normalize(name);
  if (!matchesAlias(text, "inventario") && !text.startsWith("inventario")) {
    return false;
  }
  // "Traspaso ..." y "Reporte de ventas ..." no son cortes de inventario
  // aunque lleven la palabra suelta.
  if (matchesAlias(text, "traspaso") || matchesAlias(text, "traspasos")) return false;
  return true;
}

export type Candidate = {
  file: DriveFile;
  warehouse: Warehouse;
};

export type SkippedFile = {
  name: string;
  reason: string;
};

// De todos los archivos de la carpeta, se queda con el corte MÁS RECIENTE de
// cada almacén. La carpeta acumula meses de archivos; solo interesa el último
// de cada bodega.
export function pickLatestPerWarehouse(files: DriveFile[]): {
  candidates: Candidate[];
  skipped: SkippedFile[];
} {
  const best = new Map<Warehouse, DriveFile>();
  const skipped: SkippedFile[] = [];

  for (const file of files) {
    if (!isInventoryFile(file.name)) continue;

    const { warehouse, reason } = warehouseFromFileName(file.name);
    if (!warehouse) {
      skipped.push({ name: file.name, reason: reason });
      continue;
    }

    const current = best.get(warehouse);
    if (!current || file.modifiedTime > current.modifiedTime) {
      best.set(warehouse, file);
    }
  }

  const candidates = [...best.entries()].map(([warehouse, file]) => ({
    warehouse,
    file,
  }));
  // Orden estable para que el log y las pruebas sean predecibles.
  candidates.sort((a, b) => a.warehouse.localeCompare(b.warehouse));

  return { candidates, skipped };
}
