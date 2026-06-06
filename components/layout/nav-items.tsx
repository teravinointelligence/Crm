// Definición compartida de la navegación principal.
// La consumen el Sidebar (desktop) y el MobileNav (drawer en celular)
// para mantener una sola fuente de verdad.

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
} from "lucide-react";

export type LeafItem = {
  kind?: "leaf";
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  moduleKey?: string;
};
export type GroupItem = {
  kind: "group";
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  moduleKey?: string;
  basePath: string;
  children: { href: string; label: string; icon: typeof LayoutDashboard }[];
};
export type Item = LeafItem | GroupItem;

export const NAV_ITEMS: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard }, // siempre visible
  { href: "/cuentas", label: "Cuentas", icon: Building2, moduleKey: "cuentas" },
  { href: "/contactos", label: "Contactos", icon: Users, moduleKey: "contactos" },
  { href: "/actividades", label: "Actividades", icon: CalendarCheck2, moduleKey: "actividades" },
  { href: "/catalogo", label: "Catálogo", icon: Wine, moduleKey: "catalogo" },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileSignature, moduleKey: "cotizaciones" },
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
  { href: "/cuentas-pagar", label: "Cuentas por pagar", icon: Banknote, adminOnly: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, adminOnly: true },
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

// Filtra la navegación según rol/módulos del usuario.
export function visibleNavItems(isAdmin: boolean, modules: string[]): Item[] {
  return NAV_ITEMS.filter((i) => {
    if (i.adminOnly) return isAdmin;
    if (isAdmin) return true;
    if (!i.moduleKey) return true; // dashboard / siempre visible
    return modules.includes(i.moduleKey);
  });
}
