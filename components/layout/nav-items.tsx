// Items de navegación compartidos entre el Sidebar (desktop) y el MobileMenu (celular).

import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarCheck2,
  Wine,
  FileText,
  Wallet,
  PackageCheck,
  Truck,
  Banknote,
  FlaskConical,
  BarChart3,
  ClipboardList,
  Route,
  UserCog,
  HandCoins,
  TrendingUp,
  BookOpen,
  GraduationCap,
  Radio,
  Car,
  ShieldCheck,
  Briefcase,
  Sparkles,
  Trophy,
} from "lucide-react";
import { canAccessAcademy, canAccessFacturacion, canAccessFlota, canManageReparto, canSeeFinance, canViewCreditoClientes, canViewCuentas, canViewIncentivos, canViewMuestras, canViewPortafolios, canViewReparto, isRepartoOnlyRole } from "@/lib/modules";

export type LeafItem = { kind?: "leaf"; href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean; finance?: boolean; flota?: boolean; reparto?: boolean; incentivos?: boolean; portafolios?: boolean; moduleKey?: string };
export type GroupItem = {
  kind: "group";
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  finance?: boolean;
  flota?: boolean;
  reparto?: boolean;
  incentivos?: boolean;
  portafolios?: boolean;
  moduleKey?: string;
  basePath: string;
  children: { href: string; label: string; icon: typeof LayoutDashboard; manageOnly?: boolean; creditoOnly?: boolean }[];
};
export type Item = LeafItem | GroupItem;

export const navItems: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard }, // siempre visible
  { href: "/asistente", label: "Asistente", icon: Sparkles }, // siempre visible (RLS por rol)
  { href: "/equipo", label: "Equipo en línea", icon: Radio }, // siempre visible
  { href: "/cuentas", label: "Cuentas", icon: Building2, moduleKey: "cuentas" },
  { href: "/contactos", label: "Contactos", icon: Users, moduleKey: "contactos" },
  { href: "/actividades", label: "Actividades", icon: CalendarCheck2, moduleKey: "actividades" },
  { href: "/catalogo", label: "Catálogo", icon: Wine, moduleKey: "catalogo" },
  { href: "/documentos", label: "Documentos", icon: FileText, moduleKey: "documentos" },
  { href: "/portafolios", label: "Portafolios", icon: Briefcase, portafolios: true },
  // Cotizaciones y pedidos viven en una sola lista (orders.order_type); la
  // entrada vieja /cotizaciones redirige aquí. Compat: usuarios con el módulo
  // legacy "cotizaciones" habilitado también ven esta entrada (ver filtro abajo).
  { href: "/pedidos", label: "Pedidos y cotizaciones", icon: FileText, moduleKey: "pedidos" },
  { href: "/muestras", label: "Muestras", icon: FlaskConical, moduleKey: "muestras" },
  { href: "/ventas", label: "Ventas", icon: TrendingUp, moduleKey: "ventas" },
  // Programa de incentivos (GB 2026): vendedores ven su avance; admin, el equipo.
  { href: "/incentivos", label: "Incentivos", icon: Trophy, incentivos: true },
  { href: "/cartera", label: "Cartera", icon: Wallet, moduleKey: "cartera" },
  {
    kind: "group",
    label: "Consignaciones",
    icon: HandCoins,
    basePath: "/consignaciones",
    moduleKey: "consignaciones",
    children: [
      { href: "/consignaciones", label: "Consignaciones", icon: HandCoins },
      { href: "/consignaciones/tomas", label: "Tomas de inventario", icon: ClipboardList },
    ],
  },
  { href: "/restock", label: "Restock", icon: PackageCheck, moduleKey: "restock" },
  { href: "/transito", label: "Tránsito", icon: Truck, moduleKey: "transito" },
  { href: "/cuentas-pagar", label: "Cuentas por pagar", icon: Banknote, finance: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, finance: true },
  { href: "/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
  { href: "/flota", label: "Flota", icon: Car, flota: true },
  { href: "/manuales", label: "Manuales", icon: BookOpen, moduleKey: "manuales" },
  { href: "/academy", label: "Academy", icon: GraduationCap, moduleKey: "academy" },
  {
    kind: "group",
    label: "Reparto",
    icon: Truck,
    reparto: true,
    basePath: "/reparto",
    children: [
      { href: "/reparto/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/reparto/credito", label: "Crédito clientes", icon: ShieldCheck, creditoOnly: true },
      { href: "/reparto/pedidos", label: "Pedidos", icon: ClipboardList },
      { href: "/reparto/rutas", label: "Rutas", icon: Route },
      { href: "/reparto/bitacora", label: "Bitácora", icon: FileText },
      { href: "/reparto/choferes", label: "Choferes", icon: UserCog, manageOnly: true },
      { href: "/reparto/reportes", label: "Reportes", icon: BarChart3 },
    ],
  },
];

// Filtra los items según rol y módulos habilitados (misma lógica para desktop y móvil).
export function visibleNavItems({
  isAdmin,
  modules = [],
  role,
}: {
  isAdmin: boolean;
  modules?: string[];
  role?: string | null;
}): Item[] {
  // Dentro del grupo Reparto, "Choferes" es de gestión: ocúltalo a quien solo
  // puede ver (vendedor, chofer).
  const prune = (item: Item): Item => {
    if (item.kind === "group" && item.basePath === "/reparto") {
      const children = item.children.filter(
        (c) =>
          (!c.manageOnly || canManageReparto(role)) &&
          (!c.creditoOnly || canViewCreditoClientes(role)),
      );
      return { ...item, children };
    }
    return item;
  };

  // Roles solo-reparto: en el CRM web únicamente ven la sección Reparto y los
  // Manuales (los SOPs son de consulta para todo el equipo, choferes incluidos),
  // más Flota si su rol tiene acceso (ej. el jefe de logística completa la flotilla).
  if (isRepartoOnlyRole(role)) {
    return navItems
      .filter(
        (i) =>
          (i.kind === "group" && i.basePath === "/reparto") ||
          i.moduleKey === "manuales" ||
          (i.moduleKey === "academy" && canAccessAcademy(role)) ||
          (i.flota === true && canAccessFlota(role)) ||
          // El facturista (jefe de logística) además ve Consignaciones y Documentos.
          (canAccessFacturacion(role) &&
            (i.moduleKey === "consignaciones" || i.moduleKey === "documentos")) ||
          // …y consulta las fichas de clientes (Cuentas, solo lectura).
          (i.moduleKey === "cuentas" && canViewCuentas(role)) ||
          // …y el módulo de Muestras (coordina la entrega de muestras).
          (i.moduleKey === "muestras" && canViewMuestras(role)) ||
          // …y el portafolio de vinos por zona.
          (i.portafolios === true && canViewPortafolios(role)),
      )
      .map(prune);
  }
  return navItems
    .filter((i) => {
      if (i.flota) return canAccessFlota(role);
      if (i.finance) return canSeeFinance(role);
      if (i.reparto) return canViewReparto(role);
      if (i.incentivos) return canViewIncentivos(role);
      if (i.portafolios) return canViewPortafolios(role);
      if (i.adminOnly) return isAdmin;
      if (isAdmin) return true;
      if (!i.moduleKey) return true; // dashboard / siempre visible
      // Compat: "cotizaciones" (módulo legacy, ya unificado) habilita Pedidos.
      if (i.moduleKey === "pedidos") return modules.includes("pedidos") || modules.includes("cotizaciones");
      return modules.includes(i.moduleKey);
    })
    .map(prune);
}
