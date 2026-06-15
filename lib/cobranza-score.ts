// Score de priorización de cobranza — DETERMINÍSTICO y explicable (no IA).
// Ordena las cuentas con saldo vencido combinando monto, días de atraso,
// historial de pago y si ya se contactó recientemente. Cada cuenta lleva su
// "por qué" en texto para mostrar el motivo del orden.

// Formateador local (mismo formato que lib/utils.formatCurrency). Se mantiene
// aquí para que el motor del score sea autónomo y testeable con `node --test`.
function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value);
}

/** Pesos del score (suman 1). Ajustables sin tocar la lógica. */
export const COBRANZA_WEIGHTS = {
  monto: 0.4,
  dias: 0.25,
  historial: 0.2,
  contacto: 0.15,
} as const;

/** Ventanas de "contacto reciente" (días). */
const CONTACTO_MUY_RECIENTE = 5; // contactado hace ≤5d → urgencia mínima
const CONTACTO_RECIENTE = 14; // ≤14d → urgencia a la mitad

export type PaymentProfile = "buen_pagador" | "irregular" | "moroso";

export const PROFILE_LABEL: Record<PaymentProfile, string> = {
  buen_pagador: "buen pagador",
  irregular: "pagador irregular",
  moroso: "moroso",
};

const PROFILE_RISK: Record<PaymentProfile, number> = {
  buen_pagador: 0.1,
  irregular: 0.5,
  moroso: 1.0,
};

/** Datos que el page recolecta por cuenta para rankear. */
export type CobranzaInput = {
  account_id: string;
  business_name: string;
  client_number: string | null;
  assigned_rep_id: string | null;
  saldo_vencido: number;
  saldo_pendiente: number;
  dias_vencido: number;
  total_facturado: number;
  total_pagado: number;
  /** Fecha del último pago (YYYY-MM-DD) o null. */
  last_payment_date: string | null;
  payment_count: number;
  /** Fecha del último contacto de cobranza (ISO) o null. */
  last_contact_at: string | null;
};

export type CobranzaRanked = CobranzaInput & {
  score: number; // 0–100
  profile: PaymentProfile;
  dias_desde_contacto: number | null;
  why: string;
  breakdown: { monto: number; dias: number; historial: number; contacto: number };
};

function daysSince(dateish: string | null, now: number): number | null {
  if (!dateish) return null;
  const t = new Date(dateish).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
}

/** Perfil de pago del cliente, sin matching frágil factura-por-factura. */
export function paymentProfile(input: {
  total_facturado: number;
  total_pagado: number;
  payment_count: number;
  saldo_pendiente: number;
  last_payment_date: string | null;
  now: number;
}): PaymentProfile {
  const ratio = input.total_facturado > 0 ? input.total_pagado / input.total_facturado : 0;
  const dSincePago = daysSince(input.last_payment_date, input.now);

  // Nunca pagó nada y tiene saldo → moroso.
  if (input.payment_count === 0 && input.saldo_pendiente > 0) return "moroso";
  if (ratio < 0.4) return "moroso";
  if (ratio >= 0.8 && (dSincePago == null || dSincePago <= 60)) return "buen_pagador";
  return "irregular";
}

/** Factor 0–1 de "recencia de contacto": 1 = contactado hace nada (baja urgencia). */
function contactoRecienteFactor(diasDesdeContacto: number | null): number {
  if (diasDesdeContacto == null) return 0; // nunca contactado → urgencia plena
  if (diasDesdeContacto <= CONTACTO_MUY_RECIENTE) return 1;
  if (diasDesdeContacto <= CONTACTO_RECIENTE) return 0.5;
  return 0;
}

function montoTier(rel: number): string {
  if (rel >= 0.66) return "alto";
  if (rel >= 0.33) return "medio";
  return "bajo";
}

/**
 * Rankea las cuentas. El monto se normaliza contra el máximo vencido de la
 * lista para que el peso relativo tenga sentido en esta cartera.
 */
export function buildCobranzaRanking(rows: CobranzaInput[], nowMs?: number): CobranzaRanked[] {
  const now = nowMs ?? Date.now();
  const maxVencido = Math.max(1, ...rows.map((r) => r.saldo_vencido || 0));

  const ranked = rows.map((r) => {
    const relMonto = (r.saldo_vencido || 0) / maxVencido;
    const fDias = Math.min((r.dias_vencido || 0) / 90, 1);
    const profile = paymentProfile({
      total_facturado: r.total_facturado,
      total_pagado: r.total_pagado,
      payment_count: r.payment_count,
      saldo_pendiente: r.saldo_pendiente,
      last_payment_date: r.last_payment_date,
      now,
    });
    const fHist = PROFILE_RISK[profile];
    const diasDesdeContacto = daysSince(r.last_contact_at, now);
    const fContacto = 1 - contactoRecienteFactor(diasDesdeContacto);

    const breakdown = {
      monto: COBRANZA_WEIGHTS.monto * relMonto,
      dias: COBRANZA_WEIGHTS.dias * fDias,
      historial: COBRANZA_WEIGHTS.historial * fHist,
      contacto: COBRANZA_WEIGHTS.contacto * fContacto,
    };
    const score = Math.round(
      100 * (breakdown.monto + breakdown.dias + breakdown.historial + breakdown.contacto),
    );

    const contactNote =
      diasDesdeContacto == null
        ? "sin contacto previo"
        : diasDesdeContacto === 0
          ? "contactado hoy"
          : `contactado hace ${diasDesdeContacto}d`;

    const why = `Vencido ${formatCurrency(r.saldo_vencido)} (${montoTier(relMonto)}) · ${r.dias_vencido} días · ${PROFILE_LABEL[profile]} · ${contactNote}`;

    return { ...r, score, profile, dias_desde_contacto: diasDesdeContacto, why, breakdown };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
