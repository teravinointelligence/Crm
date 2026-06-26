"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, X } from "lucide-react";

// Banner descartable que recuerda al vendedor completar los datos de sus
// cuentas (contactos/email/teléfono/CxP). Se cierra por sesión, pero reaparece
// si el conteo cambia (p. ej. quedan menos pendientes tras actualizar).
const KEY = "tv_df_banner_dismissed_count";

export function DatosFaltantesBanner({ count }: { count: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (count <= 0) return;
    const dismissed = Number(localStorage.getItem(KEY) ?? "");
    if (dismissed !== count) setShow(true);
  }, [count]);

  if (!show || count <= 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <Link href="/cuentas" className="flex items-center gap-3 min-w-0">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-medium">
            {count === 1
              ? "1 de tus cuentas tiene datos pendientes"
              : `${count} de tus cuentas tienen datos pendientes`}
          </div>
          <div className="text-xs text-muted-foreground">
            Faltan contactos, email, teléfono o contacto de Cuentas por Pagar. Toca para completarlas.
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(KEY, String(count));
          setShow(false);
        }}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-amber-100"
        aria-label="Cerrar aviso"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
