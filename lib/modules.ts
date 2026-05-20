// Catálogo de módulos seleccionables por usuario (los "estándar", no admin-only).
// Lo comparten el sidebar y la pantalla de Usuarios para mantener consistencia.
//
// Los módulos admin-only (Reportes, Cuentas por pagar, Reparto, Usuarios) no
// se listan aquí: solo los admin los ven, siempre.

export type ModuleDef = { key: string; label: string; href: string };

export const SELECTABLE_MODULES: ModuleDef[] = [
  { key: "cuentas", label: "Cuentas", href: "/cuentas" },
  { key: "contactos", label: "Contactos", href: "/contactos" },
  { key: "actividades", label: "Actividades", href: "/actividades" },
  { key: "catalogo", label: "Catálogo", href: "/catalogo" },
  { key: "cotizaciones", label: "Cotizaciones", href: "/cotizaciones" },
  { key: "pedidos", label: "Pedidos", href: "/pedidos" },
  { key: "muestras", label: "Muestras", href: "/muestras" },
  { key: "ventas", label: "Ventas", href: "/ventas" },
  { key: "cartera", label: "Cartera", href: "/cartera" },
  { key: "consignaciones", label: "Consignaciones", href: "/consignaciones" },
  { key: "restock", label: "Restock", href: "/restock" },
  { key: "transito", label: "Tránsito", href: "/transito" },
  { key: "manuales", label: "Manuales", href: "/manuales" },
];

export const ALL_MODULE_KEYS = SELECTABLE_MODULES.map((m) => m.key);

/**
 * Módulos efectivos visibles para un usuario no-admin.
 * Si `modules` es null/indefinido, se asume acceso a todos los estándar.
 */
export function effectiveModules(modules: string[] | null | undefined): string[] {
  if (modules == null) return ALL_MODULE_KEYS;
  return modules;
}
