// Navegación principal en desktop. Sección "Reparto" colapsable (admin-only).

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/Wordmark";
import { visibleNavItems, type LeafItem, type GroupItem } from "./nav-items";

export function Sidebar({ isAdmin, modules = [] }: { isAdmin: boolean; modules?: string[] }) {
  const pathname = usePathname();
  const visible = visibleNavItems(isAdmin, modules);

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
