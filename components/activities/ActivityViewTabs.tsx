"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ListChecks, History } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/actividades", label: "Bitácora", icon: History },
  { href: "/actividades/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/actividades/tareas", label: "Tareas", icon: ListChecks },
];

export function ActivityViewTabs() {
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
