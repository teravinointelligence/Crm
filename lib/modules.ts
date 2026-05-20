// Catálogo de módulos seleccionables por usuario (los "estándar", no admin-only).
// Lo comparten el sidebar y la pantalla de Usuarios para mantener consistencia.
//
// Los módulos admin-only (Reportes, Cuentas por pagar, Reparto, Usuarios) no
// se listan aquí: solo los admin los ven, siempre.

export type ModuleDef = { key: string; label: string; href: string };

// Roles del CRM. Solo 'admin' es administrador; los demás son no-admin y su
// visibilidad se controla por módulos.
export type UserRole = "admin" | "rep" | "chofer" | "jefe_logistica";

export const ROLES: { value: UserRole; label: string }[] = [
  { value: "rep", label: "Vendedor" },
  { value: "chofer", label: "Chofer" },
  { value: "jefe_logistica", label: "Jefe de logística (jefe de choferes)" },
  { value: "admin", label: "Admin (dirección)" },
];

export const ROLE_LABEL: Record<UserRole, string> = {
  rep: "Vendedor",
  chofer: "Chofer",
  jefe_logistica: "Jefe logística",
  admin: "Admin",
};

export function isValidRole(r: string): r is UserRole {
  return r === "admin" || r === "rep" || r === "chofer" || r === "jefe_logistica";
}

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
