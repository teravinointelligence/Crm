"use client";

// Pagina en cliente filas YA filtradas (la capa de datos trae el dataset
// completo y filtra en memoria; lo caro es renderizar cientos de filas).
// Vive separado de pagination.tsx para que el Pager pueda importarse desde
// Server Components sin meter hooks de React al grafo del servidor.

import { useEffect, useMemo, useState } from "react";
import { PAGE_SIZE } from "@/components/ui/pagination";

export function usePagedRows<T>(rows: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );
  // Cambió la búsqueda/filtro (cambia el total): regresa al inicio.
  useEffect(() => {
    setPage(1);
  }, [rows.length]);
  return { paged, page: safePage, pageCount, setPage, total: rows.length, pageSize };
}
