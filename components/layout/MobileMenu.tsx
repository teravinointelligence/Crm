// Menú de navegación completo para celular: hamburguesa en el Header que abre un
// panel lateral con todas las secciones (incluye Muestras, Catálogo, Ventas, etc.),
// que en móvil no caben en la BottomNav.

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/Wordmark";
import { visibleNavItems } from "./nav-items";

export function MobileMenu({
  isAdmin,
  modules = [],
  badges = {},
  role,
}: {
  isAdmin: boolean;
  modules?: string[];
  badges?: Record<string, number>;
  role?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = visibleNavItems({ isAdmin, modules, role });

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        aria-label="Abrir menú"
        className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden">
          <DialogPrimitive.Title className="sr-only">Navegación</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-5 py-5">
            <Wordmark size="md" />
            <DialogPrimitive.Close aria-label="Cerrar" className="rounded-sm opacity-70 hover:opacity-100">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
            {visible.map((item) =>
              item.kind === "group" ? (
                <div key={item.basePath} className="pt-2">
                  <div className="flex items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <div className="ml-3 space-y-0.5 border-l pl-3">
                    {item.children.map((c) => {
                      const ChildIcon = c.icon;
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                            isActive(c.href)
                              ? "bg-brand-carmesi/10 font-medium text-brand-carmesi"
                              : "text-foreground/65 hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <ChildIcon className="h-4 w-4" />
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-brand-carmesi text-white"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {badges[item.href] ? (
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                        isActive(item.href) ? "bg-white text-brand-carmesi" : "bg-brand-carmesi text-white",
                      )}
                    >
                      {badges[item.href]}
                    </span>
                  ) : null}
                </Link>
              ),
            )}
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
