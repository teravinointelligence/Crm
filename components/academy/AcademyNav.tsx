"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BookOpenCheck, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/academy", label: "Resumen", icon: LayoutGrid },
  { href: "/academy/estudiar", label: "Estudiar", icon: BookOpenCheck },
  { href: "/academy/quiz", label: "Quiz", icon: Gamepad2 },
];

export function AcademyNav() {
  const pathname = usePathname();
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted p-1">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === "/academy" ? pathname === "/academy" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
