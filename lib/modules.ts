// Catálogo de módulos seleccionables por usuario (los "estándar", no admin-only).
// Lo comparten el sidebar y la pantalla de Usuarios para mantener consistencia.
//
// Los módulos admin-only (Reportes, Cuentas por pagar, Reparto, Usuarios) no
// se listan aquí: solo los admin los ven, siempre. Excepción: el Contador
// también ve Reportes y Cuentas por pagar (ver canSeeFinance).

export type ModuleDef = { key: string; label: string; href: string };

// Roles del CRM. Solo 'admin' es administrador; los demás son no-admin y su
// visibilidad se controla por módulos. 'contador' es solo-lectura global y
// además ve las páginas financieras (Cuentas por pagar, Reportes).
export type UserRole = "admin" | "rep" | "chofer" | "jefe_logistica" | "contador";

export const ROLES: { value: UserRole; label: string }[] = [
  { value: "rep", label: "Vendedor" },
  { value: "chofer", label: "Chofer" },
  { value: "jefe_logistica", label: "Jefe de logística (jefe de choferes)" },
  { value: "contador", label: "Contador (contabilidad)" },
  { value: "admin", label: "Admin (dirección)" },
];

export const ROLE_LABEL: Record<UserRole, string> = {
  rep: "Vendedor",
  chofer: "Chofer",
  jefe_logistica: "Jefe logística",
  contador: "Contador",
  admin: "Admin",
};

export function isValidRole(r: string): r is UserRole {
  return (
    r === "admin" || r === "rep" || r === "chofer" || r === "jefe_logistica" || r === "contador"
  );
}

/**
 * Roles que ven las páginas financieras que normalmente son admin-only
 * (Cuentas por pagar, Reportes). Espejo del predicado SQL can_read_all().
 */
export function canSeeFinance(role: string | null | undefined): boolean {
  return role === "admin" || role === "contador";
}

/**
 * Roles cuyo único alcance en el CRM web es la sección Reparto. Se usan en el
 * middleware para confinar la navegación y en el sidebar para ocultar el resto.
 */
export function isRepartoOnlyRole(role: string | null | undefined): boolean {
  return role === "chofer" || role === "jefe_logistica";
}

/** Pueden VER Reparto (operación): admin, jefe de logística y choferes. */
export function canAccessReparto(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica" || role === "chofer";
}

/** Pueden GESTIONAR Reparto (altas, edición, asignación, alta de choferes). */
export function canManageReparto(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica";
}

export const SELECTABLE_MODULES: ModuleDef[] = [
  { key: "cuentas", label: "Cuentas", href: "/cuentas" },
  { key: "contactos", label: "Contactos", href: "/contactos" },
  { key: "actividades", label: "Actividades", href: "/actividades" },
  { key: "catalogo", label: "Catálogo", href: "/catalogo" },
  { key: "cotizaciones", label: "Cotizaciones", href: "/cotizaciones" },
  { key: "documentos", label: "Documentos", href: "/documentos" },
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
