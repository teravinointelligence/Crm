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
  FileSignature,
  HandCoins,
  TrendingUp,
  BookOpen,
  Radio,
} from "lucide-react";
import { canSeeFinance, isRepartoOnlyRole } from "@/lib/modules";

export type LeafItem = { kind?: "leaf"; href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean; finance?: boolean; moduleKey?: string };
export type GroupItem = {
  kind: "group";
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  finance?: boolean;
  moduleKey?: string;
  basePath: string;
  children: { href: string; label: string; icon: typeof LayoutDashboard }[];
};
export type Item = LeafItem | GroupItem;

export const navItems: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard }, // siempre visible
  { href: "/equipo", label: "Equipo en línea", icon: Radio }, // siempre visible
  { href: "/cuentas", label: "Cuentas", icon: Building2, moduleKey: "cuentas" },
  { href: "/contactos", label: "Contactos", icon: Users, moduleKey: "contactos" },
  { href: "/actividades", label: "Actividades", icon: CalendarCheck2, moduleKey: "actividades" },
  { href: "/catalogo", label: "Catálogo", icon: Wine, moduleKey: "catalogo" },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileSignature, moduleKey: "cotizaciones" },
  { href: "/documentos", label: "Documentos", icon: FileText, moduleKey: "documentos" },
  { href: "/pedidos", label: "Pedidos", icon: FileText, moduleKey: "pedidos" },
  { href: "/muestras", label: "Muestras", icon: FlaskConical, moduleKey: "muestras" },
  { href: "/ventas", label: "Ventas", icon: TrendingUp, moduleKey: "ventas" },
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
  { href: "/manuales", label: "Manuales", icon: BookOpen, moduleKey: "manuales" },
  {
    kind: "group",
    label: "Reparto",
    icon: Truck,
    adminOnly: true,
    basePath: "/reparto",
    children: [
      { href: "/reparto/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/reparto/pedidos", label: "Pedidos", icon: ClipboardList },
      { href: "/reparto/rutas", label: "Rutas", icon: Route },
      { href: "/reparto/bitacora", label: "Bitácora", icon: FileText },
      { href: "/reparto/choferes", label: "Choferes", icon: UserCog },
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
  // Roles solo-reparto: en el CRM web únicamente ven la sección Reparto.
  if (isRepartoOnlyRole(role)) {
    return navItems.filter((i) => i.kind === "group" && i.basePath === "/reparto");
  }
  return navItems.filter((i) => {
    if (i.finance) return canSeeFinance(role);
    if (i.adminOnly) return isAdmin;
    if (isAdmin) return true;
    if (!i.moduleKey) return true; // dashboard / siempre visible
    return modules.includes(i.moduleKey);
  });
}
