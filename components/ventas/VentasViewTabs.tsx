"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, RotateCcw, Scale, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/ventas", label: "Ventas", icon: TrendingUp },
  { href: "/ventas/reactivadas", label: "Reactivadas", icon: RotateCcw },
  { href: "/ventas/ticket", label: "Ticket promedio", icon: Receipt },
  { href: "/ventas/conciliacion", label: "Conciliación", icon: Scale },
];

export function VentasViewTabs() {
  const pathname = usePathname();
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
