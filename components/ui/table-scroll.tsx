"use client";

// Contenedor estándar para tablas anchas: scroll horizontal con sombras en los
// bordes que indican "hay más columnas" (en tablet el sidebar ya no está pero
// las tablas siguen en layout desktop y se cortaban sin señal visual).
//
// Si la tabla tiene columna de acciones, fíjala con STICKY_CELL/STICKY_HEAD
// (de components/ui/table-sticky) y pasa `stickyRight` para que la sombra
// derecha no tape la columna fija (la propia columna, con su sombra, hace de
// indicador).

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function TableScroll({
  children,
  className,
  stickyRight = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** La tabla tiene columna de acciones sticky: omite la sombra derecha. */
  stickyRight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [update]);

  const scrollable = edges.left || edges.right;

  return (
    <div
      className={cn("group relative rounded-lg border bg-card", className)}
      data-scrollable={scrollable ? "" : undefined}
    >
      <div ref={ref} onScroll={update} className="overflow-x-auto rounded-lg">
        {children}
      </div>
      {edges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-lg bg-gradient-to-r from-foreground/10 to-transparent" />
      )}
      {edges.right && !stickyRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-foreground/10 to-transparent" />
      )}
    </div>
  );
}
