// Mismo formato que lib/utils.ts pero importable desde route handlers
// (lib/utils.ts no tiene "server-only" pero conviene mantener un util mínimo aquí
// para no jalar dependencias cliente desde rutas server).
export function formatCurrencyMxn(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value);
}
