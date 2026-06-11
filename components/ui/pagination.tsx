// Paginación de listados largos. Sin "use client" a propósito: el Pager es
// presentacional y lo usan tanto Server Components (modo `hrefFor`, links con
// searchParams) como Client Components (modo `onPageChange` + usePagedRows,
// que vive en use-paged-rows.ts para no meter hooks al grafo del servidor).

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 50;

export function Pager({
  page,
  pageCount,
  total,
  pageSize = PAGE_SIZE,
  onPageChange,
  hrefFor,
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize?: number;
  /** Modo cliente: cambia de página con estado local. */
  onPageChange?: (page: number) => void;
  /** Modo servidor: genera el href de cada página (links con searchParams). */
  hrefFor?: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const NavButton = ({ target, disabled, children, label }: {
    target: number;
    disabled: boolean;
    children: React.ReactNode;
    label: string;
  }) =>
    hrefFor && !disabled ? (
      <Button asChild variant="outline" size="sm" aria-label={label}>
        <Link href={hrefFor(target)}>{children}</Link>
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-label={label}
        onClick={onPageChange ? () => onPageChange(target) : undefined}
      >
        {children}
      </Button>
    );

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 text-sm", className)}>
      <span className="text-xs text-muted-foreground">
        Mostrando {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-2">
        <NavButton target={page - 1} disabled={page <= 1} label="Página anterior">
          <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
        </NavButton>
        <span className="text-xs text-muted-foreground">
          {page} / {pageCount}
        </span>
        <NavButton target={page + 1} disabled={page >= pageCount} label="Página siguiente">
          Siguiente <ChevronRight className="ml-1 h-4 w-4" />
        </NavButton>
      </div>
    </div>
  );
}
