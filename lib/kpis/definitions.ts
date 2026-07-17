// Catálogo de KPIs del Tablero (/tablero). Cada definición documenta qué mide,
// cómo se calcula y de dónde salen los datos, y alimenta los tooltips/README.
// Los cálculos viven en lib/kpis/data.ts; las metas en config/kpi-targets.ts
// (mismas claves `id`).

export type KpiNivel = "direccion" | "vendedor" | "region";
export type KpiFrecuencia = "mensual" | "semanal";

export type KpiDefinition = {
  id: string;
  nombre: string;
  /** Descripción / fórmula en palabras. */
  formula: string;
  /** Tabla(s)/vista(s) de donde sale. */
  fuente: string;
  /** Cadencia sugerida de revisión: cobranza y disciplina comercial = semanal. */
  frecuencia: KpiFrecuencia;
  nivel: KpiNivel;
};

export const KPI_DEFINITIONS: KpiDefinition[] = [
  // ------------------------------------------------------------------
  // NIVEL 1 — DIRECCIÓN
  // ------------------------------------------------------------------
  {
    id: "venta_bruta",
    nombre: "Venta bruta",
    formula: "Suma de venta_bruta del periodo (mismos números que /ventas y /reportes).",
    fuente: "monthly_sales (importación mensual CONTPAQ)",
    frecuencia: "mensual",
    nivel: "direccion",
  },
  {
    id: "crecimiento_mom",
    nombre: "Crecimiento mes contra mes",
    formula:
      "(venta del último mes cargado − venta del mes anterior) / venta del mes anterior × 100. Usa la tendencia 12 meses de /reportes.",
    fuente: "monthly_sales",
    frecuencia: "mensual",
    nivel: "direccion",
  },
  {
    id: "ticket_promedio",
    nombre: "Ticket promedio por cuenta",
    formula: "Venta bruta del periodo / cuentas con compra en el periodo.",
    fuente: "monthly_sales",
    frecuencia: "mensual",
    nivel: "direccion",
  },
  {
    id: "cuentas_con_compra",
    nombre: "Cuentas activas y con compra",
    formula:
      "Cuentas con status activo (total CRM) y cuentas distintas con al menos una venta en el periodo.",
    fuente: "accounts + monthly_sales",
    frecuencia: "mensual",
    nivel: "direccion",
  },
  {
    id: "pct_cartera_vencida",
    nombre: "% cartera vencida",
    formula: "Saldo vencido / saldo pendiente total × 100 (KPI crítico de cobranza).",
    fuente: "v_account_balance (misma vista que /cartera)",
    frecuencia: "semanal",
    nivel: "direccion",
  },
  {
    id: "dso",
    nombre: "DSO (días promedio de cobro)",
    formula:
      "Saldo pendiente / venta bruta del periodo × días del periodo. Aproximación estándar; con saldo alto y venta baja el número crece.",
    fuente: "v_account_balance + monthly_sales",
    frecuencia: "semanal",
    nivel: "direccion",
  },
  {
    id: "cuentas_caida",
    nombre: "Cuentas en caída de compra",
    formula:
      "Cuentas cuyo último mes cargado quedó ≥50% abajo (o en cero) de su propio promedio de 3 meses — mismo motor que la tarjeta del Dashboard.",
    fuente: "monthly_sales vía lib/churn.ts (computeChurn)",
    frecuencia: "mensual",
    nivel: "direccion",
  },
  {
    id: "cuentas_reactivadas",
    nombre: "Cuentas reactivadas",
    formula:
      "Cuentas con venta en el último mes cargado, sin venta el mes anterior pero con historial previo.",
    fuente: "monthly_sales",
    frecuencia: "mensual",
    nivel: "direccion",
  },
  {
    id: "productos_riesgo",
    nombre: "Productos en riesgo de quiebre",
    formula:
      "Productos cuyo stock proyectado no cubre el lead time del proveedor — mismo modelo que /restock/sugerencias.",
    fuente: "lib/restock-data.ts (getAtRiskProductIds)",
    frecuencia: "semanal",
    nivel: "direccion",
  },
  {
    id: "mix_producto",
    nombre: "Mix de producto",
    formula:
      "% de la venta del periodo por familia (vino / cerveza / espumosos / otros), cruzando el código CONTPAQ de cada renglón con la categoría del catálogo.",
    fuente: "monthly_sales_items × products (sku / codigo_contpaqi)",
    frecuencia: "mensual",
    nivel: "direccion",
  },
  {
    id: "conversion_pipeline",
    nombre: "Pipeline vs cerrado",
    formula:
      "Cotizaciones abiertas ($, borrador/enviada) vs pedidos cerrados del periodo ($, aceptada/facturada/entregada). Conversión = cerrado / (cerrado + pipeline) × 100. OJO: orders son cotizaciones del CRM, no facturación.",
    fuente: "orders",
    frecuencia: "mensual",
    nivel: "direccion",
  },

  // ------------------------------------------------------------------
  // NIVEL 2 — VENDEDOR (disciplina comercial y cobertura de cartera)
  // ------------------------------------------------------------------
  {
    id: "v_venta_bruta",
    nombre: "Venta bruta y base comisión",
    formula:
      "Suma de venta_bruta / neto_desc del vendedor en el periodo, % del total del equipo y variación vs el mes anterior.",
    fuente: "monthly_sales",
    frecuencia: "mensual",
    nivel: "vendedor",
  },
  {
    id: "v_ticket_promedio",
    nombre: "Ticket promedio de sus cuentas",
    formula: "Venta bruta del vendedor / sus cuentas con compra en el periodo.",
    fuente: "monthly_sales",
    frecuencia: "mensual",
    nivel: "vendedor",
  },
  {
    id: "v_actividades",
    nombre: "Actividades por tipo",
    formula:
      "Actividades del periodo desglosadas por tipo (visita, llamada, degustación, email, WhatsApp, reunión, evento).",
    fuente: "activities",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_cumplimiento_citas",
    nombre: "Citas agendadas vs realizadas",
    formula:
      "Realizadas / (realizadas + agendadas ya vencidas) × 100 en el periodo. Las citas futuras no castigan.",
    fuente: "activities (status agendada/realizada)",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_siguientes_vencidos",
    nombre: "Próximos pasos vencidos",
    formula:
      "Actividades con campo Siguiente sin completar (next_step_done = false) y fecha ya pasada.",
    fuente: "activities (next_step_date)",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_ultima_conexion",
    nombre: "Última conexión al CRM",
    formula: "last_seen_at del vendedor (mismo dato que Actividad del equipo del Dashboard).",
    fuente: "sales_reps.last_seen_at",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_cobertura_cartera",
    nombre: "Cobertura de cartera",
    formula:
      "% de sus cuentas activas con al menos 1 actividad registrada en los últimos 30 días.",
    fuente: "accounts + activities",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_cuentas_inactivas",
    nombre: "Cuentas inactivas (30+ días)",
    formula:
      "Sus cuentas activas sin actividad en 30+ días (o sin actividad alguna), con lista clickable.",
    fuente: "v_account_last_activity (misma vista que Visitar pronto)",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_clientes_sin_pedido",
    nombre: "Sin pedido este mes",
    formula:
      "Sus cuentas que compraron el mes anterior (al último cargado) y no aparecen en el último mes, con lo que facturaban en promedio (3 meses).",
    fuente: "monthly_sales",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_cartera_vencida",
    nombre: "Cartera vencida / suspendidas",
    formula:
      "Cuentas suyas con saldo vencido, cuántas caen en Suspendido (45+ días, política de /cartera) y el monto vencido total.",
    fuente: "v_account_balance + semaforoCobranza (lib/cobranza.ts)",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_prospectos_sin_gestion",
    nombre: "Prospectos sin primera gestión",
    formula: "Sus cuentas en status prospecto sin ninguna actividad registrada.",
    fuente: "v_account_last_activity",
    frecuencia: "semanal",
    nivel: "vendedor",
  },
  {
    id: "v_pendientes_semana",
    nombre: "Pendientes de la semana",
    formula:
      "Lista accionable: cuentas inactivas + clientes sin pedido este mes + próximos pasos vencidos, ordenada por severidad y monto, con acceso directo a registrar actividad.",
    fuente: "combinación de los KPIs anteriores",
    frecuencia: "semanal",
    nivel: "vendedor",
  },

  // ------------------------------------------------------------------
  // NIVEL 3 — REGIÓN
  // ------------------------------------------------------------------
  {
    id: "r_venta_bruta",
    nombre: "Venta bruta por región",
    formula: "Suma de venta_bruta del periodo por región de la cuenta, % del total y variación MoM.",
    fuente: "monthly_sales × accounts.region",
    frecuencia: "mensual",
    nivel: "region",
  },
  {
    id: "r_penetracion",
    nombre: "Penetración",
    formula: "Cuentas con compra en el periodo / cuentas activas de la región × 100.",
    fuente: "monthly_sales + accounts",
    frecuencia: "mensual",
    nivel: "region",
  },
  {
    id: "r_vencido",
    nombre: "Vencido de la región",
    formula: "Saldo vencido de la región y % sobre su saldo pendiente.",
    fuente: "v_account_balance",
    frecuencia: "semanal",
    nivel: "region",
  },
  {
    id: "r_inactivas",
    nombre: "Cuentas inactivas",
    formula: "Cuentas activas de la región sin actividad en 30+ días.",
    fuente: "v_account_last_activity",
    frecuencia: "semanal",
    nivel: "region",
  },
];

export function kpiDef(id: string): KpiDefinition | undefined {
  return KPI_DEFINITIONS.find((k) => k.id === id);
}
