// La sección Cotizaciones se unificó con Pedidos en una sola lista con filtro
// por tipo (/pedidos?tipo=cotizacion). Esta ruta queda como redirect para no
// romper marcadores ni enlaces guardados.

import { redirect } from "next/navigation";

export default function CotizacionesPage() {
  redirect("/pedidos?tipo=cotizacion");
}
