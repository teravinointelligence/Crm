// Drawer de navegación para celular. Expone la navegación completa
// (todos los módulos), no solo los accesos rápidos de la BottomNav.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/Wordmark";
import { visibleNavItems, type GroupItem, type LeafItem } from "./nav-items";

export function MobileNav({
  isAdmin,
  modules = [],
}: {
  isAdmin: boolean;
  modules?: string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = visibleNavItems(isAdmin, modules);

  // Cierra el drawer al navegar a otra ruta.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col border-r bg-card shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden">
          <DialogPrimitive.Title className="sr-only">Menú de navegación</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-5 py-5">
            <Wordmark size="md" />
            <DialogPrimitive.Close
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
            {visible.map((item) =>
              item.kind === "group" ? (
                <MobileNavGroup key={item.basePath} item={item} pathname={pathname} />
              ) : (
                <MobileNavLeaf key={item.href} item={item} pathname={pathname} />
              ),
            )}
          </nav>
          <div className="border-t px-5 py-4 text-xs text-muted-foreground">
            TERAVINO, S.A. de C.V.
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function MobileNavLeaf({ item, pathname }: { item: LeafItem; pathname: string }) {
  const { href, label, icon: Icon } = item;
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
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

function MobileNavGroup({ item, pathname }: { item: GroupItem; pathname: string }) {
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
          "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
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
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
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
