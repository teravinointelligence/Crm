// Navegación inferior en mobile. 6° ícono "Reparto" admin-only.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Wine,
  FileText,
  CalendarCheck2,
  Wallet,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const baseItems = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/cuentas", label: "Cuentas", icon: Building2 },
  { href: "/actividades", label: "Visitas", icon: CalendarCheck2 },
  { href: "/pedidos", label: "Pedidos", icon: FileText },
  { href: "/cartera", label: "Cartera", icon: Wallet },
];
const adminExtra = { href: "/reparto/pedidos", label: "Reparto", icon: Truck };

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...baseItems, adminExtra] : baseItems;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card lg:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href ||
              pathname.startsWith(`${href}/`) ||
              (href === "/reparto/pedidos" && pathname.startsWith("/reparto"));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
              active ? "text-brand-carmesi" : "text-foreground/60",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
