// Metas y umbrales de semáforo del Tablero de KPIs (/tablero).
//
// TODO(BD): estos valores por defecto viven en código para arrancar; el plan es
// moverlos a una tabla editable (kpi_targets) para que dirección los ajuste
// desde la app sin deploy. Mantener las claves estables (son los ids de
// lib/kpis/definitions.ts) para que la migración sea 1:1.
//
// Semántica del semáforo:
//   - direction "higher": más es mejor (venta, cobertura). verde si
//     valor >= meta * verdePct, ámbar si >= meta * ambarPct, rojo abajo.
//   - direction "lower": menos es mejor (% vencido, DSO, vencidos sin
//     completar). verde si valor <= meta, ámbar si <= meta * ambarFactor,
//     rojo arriba.

export type SemaforoColor = "verde" | "ambar" | "rojo";

export type KpiTarget = {
  /** Meta del periodo (moneda MXN, %, días o conteo según el KPI). */
  meta: number;
  direction: "higher" | "lower";
  /** higher: fracción de la meta para estar en verde (default 1 = cumplir). */
  verdePct?: number;
  /** higher: fracción de la meta para estar en ámbar (default 0.8). */
  ambarPct?: number;
  /** lower: multiplicador de la meta que todavía tolera ámbar (default 1.5). */
  ambarFactor?: number;
};

/** Evalúa el semáforo de un valor contra su meta. */
export function semaforoKpi(value: number, target: KpiTarget): SemaforoColor {
  if (target.direction === "higher") {
    const verde = target.meta * (target.verdePct ?? 1);
    const ambar = target.meta * (target.ambarPct ?? 0.8);
    if (value >= verde) return "verde";
    if (value >= ambar) return "ambar";
    return "rojo";
  }
  const ambarMax = target.meta * (target.ambarFactor ?? 1.5);
  if (value <= target.meta) return "verde";
  if (value <= ambarMax) return "ambar";
  return "rojo";
}

// ---------------------------------------------------------------------------
// NIVEL DIRECCIÓN — metas mensuales globales. Las metas de venta son del MES;
// para periodos de varios meses el tablero las multiplica por los meses del
// periodo.
// ---------------------------------------------------------------------------
export const DIRECCION_TARGETS: Record<string, KpiTarget> = {
  venta_bruta: { meta: 3_000_000, direction: "higher" }, // MXN / mes
  crecimiento_mom: { meta: 3, direction: "higher", ambarPct: 0 }, // % vs mes anterior
  ticket_promedio: { meta: 18_000, direction: "higher" }, // MXN por cuenta con compra
  cuentas_con_compra: { meta: 140, direction: "higher" }, // cuentas / mes
  pct_cartera_vencida: { meta: 15, direction: "lower", ambarFactor: 1.6 }, // % del saldo
  dso: { meta: 45, direction: "lower", ambarFactor: 1.4 }, // días promedio de cobro
  cuentas_caida: { meta: 10, direction: "lower", ambarFactor: 2 }, // cuentas que dejaron de facturar
  cuentas_reactivadas: { meta: 5, direction: "higher", ambarPct: 0.4 },
  productos_riesgo: { meta: 5, direction: "lower", ambarFactor: 2 }, // quiebres de stock
  conversion_pipeline: { meta: 50, direction: "higher", ambarPct: 0.6 }, // % cotizado→cerrado
};

// ---------------------------------------------------------------------------
// NIVEL VENDEDOR — metas mensuales por vendedor (iguales para todos por ahora;
// al pasar a BD podrán ser por persona).
// ---------------------------------------------------------------------------
export const VENDEDOR_TARGETS: Record<string, KpiTarget> = {
  venta_bruta: { meta: 500_000, direction: "higher" }, // MXN / mes / vendedor
  ticket_promedio: { meta: 15_000, direction: "higher" },
  actividades: { meta: 40, direction: "higher" }, // registros / mes
  cumplimiento_citas: { meta: 80, direction: "higher" }, // % citas realizadas
  siguientes_vencidos: { meta: 0, direction: "lower", ambarFactor: 3 }, // próximos pasos vencidos
  cobertura_cartera: { meta: 60, direction: "higher", ambarPct: 0.66 }, // % cuentas con actividad 30d
  cuentas_inactivas: { meta: 5, direction: "lower", ambarFactor: 2 },
  clientes_sin_pedido: { meta: 3, direction: "lower", ambarFactor: 2 },
  monto_vencido: { meta: 150_000, direction: "lower", ambarFactor: 1.6 }, // MXN vencido de su cartera
  prospectos_sin_gestion: { meta: 0, direction: "lower", ambarFactor: 3 },
};

// ---------------------------------------------------------------------------
// NIVEL REGIÓN
// ---------------------------------------------------------------------------
export const REGION_TARGETS: Record<string, KpiTarget> = {
  penetracion: { meta: 45, direction: "higher", ambarPct: 0.7 }, // % cuentas con compra
  pct_vencido: { meta: 15, direction: "lower", ambarFactor: 1.6 },
};
