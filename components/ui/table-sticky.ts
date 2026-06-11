// Clases para fijar la columna de acciones de una tabla dentro de TableScroll.
// Viven en un módulo plano (sin "use client") porque las importan también
// Server Components: importar strings desde un módulo cliente entrega client
// references ([object Object]) en el servidor, no el string.

/** Celda de acciones fija a la derecha (td). Fondo sólido para tapar lo que pasa debajo. */
export const STICKY_CELL =
  "sticky right-0 bg-card group-data-[scrollable]:shadow-[-8px_0_8px_-6px_rgba(31,26,28,0.12)]";

/** Encabezado de la columna de acciones fija (th). El fondo es el resultado
 *  de bg-muted/50 (encabezados de tabla) sobre bg-card, pero sólido. */
export const STICKY_HEAD = "sticky right-0 bg-[hsl(36,25%,97%)]";
