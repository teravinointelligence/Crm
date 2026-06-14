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

/**
 * Roles de OPERACIÓN de Reparto: admin, jefe de logística y choferes. Además de
 * ver, pueden registrar entregas (subir evidencia). NO incluye al vendedor, que
 * es solo-lectura (ver `canViewReparto`).
 */
export function canAccessReparto(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica" || role === "chofer";
}

/**
 * Pueden VER Reparto (solo lectura). Es la operación (admin, jefe, chofer) más
 * el vendedor, que entra de visita para consultar el estatus de sus entregas
 * pero no puede alterar nada. Se usa en los guards de las páginas/GETs de lectura.
 */
export function canViewReparto(role: string | null | undefined): boolean {
  return canAccessReparto(role) || role === "rep";
}

/** Pueden GESTIONAR Reparto (altas, edición, asignación, alta de choferes). */
export function canManageReparto(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica";
}

/**
 * Pueden VER y editar el parque vehicular (módulo Flota). Es responsabilidad de
 * logística: admin y jefe de logística (Isaí). Como `jefe_logistica` es un rol
 * "solo-reparto", el middleware y el sidebar lo dejan llegar también a /flota.
 */
export function canAccessFlota(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica";
}

/**
 * Pueden VER la lista de clientes por estatus de crédito (liberado / por revisar
 * / suspendido) dentro de Reparto. Es una vista operativa para decidir entregas:
 * admin y jefe de logística (Isaí). NO incluye choferes ni vendedores, y por
 * diseño no expone montos $ (solo la clasificación de riesgo y días vencidos).
 */
export function canViewCreditoClientes(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica";
}

/**
 * Roles con acceso TOTAL (ver todo + operar) a los módulos de facturación —
 * Consignaciones y Documentos. Es el admin y el facturista (que en TERAVINO es
 * el jefe de logística, Isaí): factura a partir de consignaciones y genera
 * documentos para cualquier cuenta, así que necesita el mismo alcance que admin
 * en esos dos módulos. Como `jefe_logistica` es un rol "solo-reparto", el
 * middleware y el sidebar lo dejan llegar también a /consignaciones y /documentos.
 */
export function canAccessFacturacion(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica";
}

/**
 * Pueden entrar a Academy aunque su rol esté confinado a Reparto: el jefe de
 * logística (Isaí) también estudia el portafolio y hace quizzes. Para los roles
 * estándar la visibilidad se controla por módulos (key "academy").
 */
export function canAccessAcademy(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica";
}

/**
 * Pueden VER el módulo de Cuentas (lista y ficha de clientes) aunque su rol
 * esté confinado a Reparto: el jefe de logística (Isaí) consulta las fichas
 * para facturar y coordinar entregas. Es solo lectura — la edición sigue
 * siendo del admin o del vendedor asignado, y la RLS solo le abre SELECT
 * (migración 0051). Para los roles estándar (rep/contador) el acceso a
 * Cuentas se controla como siempre (módulos + RLS).
 */
export function canViewCuentas(role: string | null | undefined): boolean {
  return role === "admin" || role === "jefe_logistica";
}

/**
 * Pueden VER el Programa de Incentivos (/incentivos): los vendedores (su
 * propio avance), el admin (dashboard del equipo + gestión) y el contador
 * (consulta los montos comprometidos). No aplica a roles de reparto.
 */
export function canViewIncentivos(role: string | null | undefined): boolean {
  return role === "admin" || role === "rep" || role === "contador";
}

export const SELECTABLE_MODULES: ModuleDef[] = [
  { key: "cuentas", label: "Cuentas", href: "/cuentas" },
  { key: "contactos", label: "Contactos", href: "/contactos" },
  { key: "actividades", label: "Actividades", href: "/actividades" },
  { key: "catalogo", label: "Catálogo", href: "/catalogo" },
  { key: "documentos", label: "Documentos", href: "/documentos" },
  { key: "portafolios", label: "Portafolios", href: "/portafolios" },
  { key: "pedidos", label: "Pedidos y cotizaciones", href: "/pedidos" },
  { key: "muestras", label: "Muestras", href: "/muestras" },
  { key: "ventas", label: "Ventas", href: "/ventas" },
  { key: "cartera", label: "Cartera", href: "/cartera" },
  { key: "consignaciones", label: "Consignaciones", href: "/consignaciones" },
  { key: "restock", label: "Restock", href: "/restock" },
  { key: "transito", label: "Tránsito", href: "/transito" },
  { key: "manuales", label: "Manuales", href: "/manuales" },
  { key: "academy", label: "Academy", href: "/academy" },
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
