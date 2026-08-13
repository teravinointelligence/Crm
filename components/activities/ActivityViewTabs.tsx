"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ListChecks, History, Sun, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/actividades/hoy", label: "Mi día", icon: Sun },
  { href: "/actividades", label: "Bitácora", icon: History },
  { href: "/actividades/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/actividades/tareas", label: "Tareas", icon: ListChecks },
  { href: "/actividades/conversion", label: "Conversión", icon: TrendingUp },
];

export function ActivityViewTabs() {
  const pathname = usePathname();
  return (
    // Scroll horizontal: con 5 pestañas ya no caben en un celular angosto.
    <div className="-mx-1 flex items-center gap-1 overflow-x-auto rounded-md bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.href || pathname.startsWith(t.href + "/") && t.href !== "/actividades";
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
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
