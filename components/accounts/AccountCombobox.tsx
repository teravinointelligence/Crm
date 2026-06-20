"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type AccountOption = {
  id: string;
  business_name: string;
  region?: string | null;
  /** Nombre fiscal/razón social — se incluye en la búsqueda aunque no se muestre. */
  fiscal_name?: string | null;
  /** Número de cliente — también se puede buscar por él. */
  client_number?: string | null;
};

const MAX_VISIBLE = 50;

/**
 * Selector de cuenta con búsqueda. Reemplaza al <Select> simple en formularios
 * donde elegir entre cientos de cuentas era incómodo. Controlado por value/onChange.
 */
export function AccountCombobox({
  accounts,
  value,
  onChange,
  placeholder = "Selecciona cuenta",
  id,
  noneValue,
  noneLabel,
}: {
  accounts: AccountOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
  /** Si se define, muestra una opción para "sin cuenta" con este valor/etiqueta. */
  noneValue?: string;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = accounts.find((a) => a.id === value) ?? null;
  const hasNone = noneValue !== undefined && noneLabel !== undefined;
  const isNone = hasNone && value === noneValue;

  const triggerLabel = selected
    ? `${selected.business_name}${selected.region ? ` · ${selected.region}` : ""}`
    : isNone
      ? noneLabel
      : placeholder;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, MAX_VISIBLE);
    return accounts
      .filter(
        (a) =>
          a.business_name.toLowerCase().includes(q) ||
          (a.region ?? "").toLowerCase().includes(q) ||
          (a.fiscal_name ?? "").toLowerCase().includes(q) ||
          (a.client_number ?? "").toLowerCase().includes(q),
      )
      .slice(0, MAX_VISIBLE);
  }, [accounts, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("truncate", !selected && !isNone && "text-muted-foreground")}>
          {triggerLabel}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cuenta…"
              className="h-10 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {hasNone && query.trim() === "" && (
              <li>
                <button
                  type="button"
                  onClick={() => select(noneValue!)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted",
                    isNone && "bg-muted",
                  )}
                >
                  <Check
                    className={cn("h-4 w-4 shrink-0", isNone ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{noneLabel}</span>
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Sin resultados
              </li>
            ) : (
              filtered.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => select(a.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      a.id === value && "bg-muted",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        a.id === value ? "text-brand-carmesi opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">
                      {a.business_name}
                      {a.region ? (
                        <span className="text-muted-foreground"> · {a.region}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {query.trim() === "" && accounts.length > MAX_VISIBLE && (
            <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
              Escribe para buscar entre {accounts.length} cuentas…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
