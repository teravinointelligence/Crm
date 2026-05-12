"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/Wordmark";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const items: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cuentas", label: "Cuentas", icon: Building2 },
  { href: "/contactos", label: "Contactos", icon: Users },
  { href: "/actividades", label: "Actividades", icon: CalendarCheck2 },
  { href: "/catalogo", label: "Catálogo", icon: Wine },
  { href: "/pedidos", label: "Pedidos", icon: FileText },
  { href: "/muestras", label: "Muestras", icon: FlaskConical },
  { href: "/cartera", label: "Cartera", icon: Wallet },
  { href: "/restock", label: "Restock", icon: PackageCheck },
  { href: "/transito", label: "Tránsito", icon: Truck },
  { href: "/cuentas-pagar", label: "Cuentas por pagar", icon: Banknote, adminOnly: true },
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
        {visible.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
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
        })}
      </nav>
      <div className="border-t px-6 py-4 text-xs text-muted-foreground">
        TERAVINO, S.A. de C.V.
      </div>
    </aside>
  );
}
