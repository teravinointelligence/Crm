// Navegación principal en desktop. Sección "Reparto" colapsable (admin-only).

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Route,
  UserCog,
  FileSignature,
  HandCoins,
  TrendingUp,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/Wordmark";

type LeafItem = { kind?: "leaf"; href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };
type GroupItem = {
  kind: "group";
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  basePath: string;
  children: { href: string; label: string; icon: typeof LayoutDashboard }[];
};
type Item = LeafItem | GroupItem;

const items: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cuentas", label: "Cuentas", icon: Building2 },
  { href: "/contactos", label: "Contactos", icon: Users },
  { href: "/actividades", label: "Actividades", icon: CalendarCheck2 },
  { href: "/catalogo", label: "Catálogo", icon: Wine },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileSignature },
  { href: "/pedidos", label: "Pedidos", icon: FileText },
  { href: "/muestras", label: "Muestras", icon: FlaskConical },
  { href: "/ventas", label: "Ventas", icon: TrendingUp },
  { href: "/cartera", label: "Cartera", icon: Wallet },
  {
    kind: "group",
    label: "Consignaciones",
    icon: HandCoins,
    basePath: "/consignaciones",
    children: [
      { href: "/consignaciones", label: "Consignaciones", icon: HandCoins },
      { href: "/consignaciones/tomas", label: "Tomas de inventario", icon: ClipboardList },
    ],
  },
  { href: "/restock", label: "Restock", icon: PackageCheck },
  { href: "/transito", label: "Tránsito", icon: Truck },
  { href: "/cuentas-pagar", label: "Cuentas por pagar", icon: Banknote, adminOnly: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, adminOnly: true },
  { href: "/manuales", label: "Manuales", icon: BookOpen },
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

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const visible = items.filter((i) => !i.adminOnly || isAdmin);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <div className="px-6 py-6">
        <Wordmark size="md" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {visible.map((item) =>
          item.kind === "group" ? (
            <NavGroup key={item.basePath} item={item} pathname={pathname} />
          ) : (
            <NavLeaf key={item.href} item={item} pathname={pathname} />
          ),
        )}
      </nav>
      <div className="border-t px-6 py-4 text-xs text-muted-foreground">
        TERAVINO, S.A. de C.V.
      </div>
    </aside>
  );
}

function NavLeaf({ item, pathname }: { item: LeafItem; pathname: string }) {
  const { href, label, icon: Icon } = item;
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-brand-carmesi text-white"
          : "text-foreground/70 hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function NavGroup({ item, pathname }: { item: GroupItem; pathname: string }) {
  const sectionActive = pathname.startsWith(item.basePath);
  const [open, setOpen] = useState(sectionActive);
  const Icon = item.icon;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          sectionActive ? "text-foreground" : "text-foreground/70 hover:bg-muted hover:text-foreground",
        )}
        aria-expanded={open}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{item.label}</span>
        <Chevron className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="ml-3 space-y-0.5 border-l pl-3">
          {item.children.map((c) => {
            const ChildIcon = c.icon;
            const active = pathname === c.href || pathname.startsWith(`${c.href}/`);
            return (
              <Link
                key={c.href}
                href={c.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-brand-carmesi/10 font-medium text-brand-carmesi"
                    : "text-foreground/65 hover:bg-muted hover:text-foreground",
                )}
              >
                <ChildIcon className="h-3.5 w-3.5" />
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
