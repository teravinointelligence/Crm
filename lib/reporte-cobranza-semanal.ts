// Reporte semanal de cobranza (lunes). Arma DOS piezas a partir de la misma
// carga de datos:
//
//   1. Resumen general  → para Pedidos (Isaí) y Contabilidad. Todos los clientes
//      con saldo vencido, agrupados por vendedor, con el corte por estatus de
//      crédito (Suspender / Por revisar / Dentro de tolerancia).
//   2. Reporte por vendedor → a cada vendedor SOLO su cartera vencida, con los
//      clientes de crédito suspendido hasta arriba.
//
// Fuente de verdad: v_account_balance (saldo_vencido y dias_vencido calculados
// con emisión + accounts.credit_days) + clasificarRiesgo() de lib/cobranza.
// Las cuentas socio ya llegan con saldo_vencido = 0 desde la vista, así que
// quedan fuera solas. Las cuentas legacy se excluyen del reporte operativo
// (igual que en el resto del CRM) pero se reportan como conteo para que no
// desaparezcan en silencio.
//
// Este módulo NO envía nada: solo devuelve {to, subject, html}.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { clasificarRiesgo, type ClaseRiesgo } from "@/lib/cobranza";
import { sendEmail, cobranzaFrom } from "@/lib/email";
import type { AccountBalance } from "@/types/database";

// Acepta el cliente con cookies (admin vía RLS) o el service-role (cron).
type DbClient = ReturnType<typeof createClient> | SupabaseClient;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app";

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(Number(n ?? 0));

const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(d);

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export type ClienteVencido = {
  accountId: string;
  nombre: string;
  clientNumber: string | null;
  region: string | null;
  repId: string | null;
  saldoPendiente: number;
  saldoVencido: number;
  diasVencido: number;
  facturasAbiertas: number;
  clase: ClaseRiesgo;
};

export type CarteraVendedor = {
  repId: string | null;
  repName: string;
  repEmail: string | null;
  clientes: ClienteVencido[];
  totalVencido: number;
  suspendidos: number;
};

export type CarteraVencida = {
  corte: Date;
  vendedores: CarteraVendedor[];
  totalClientes: number;
  totalVencido: number;
  totalSuspendidos: number;
  vencidoSuspendidos: number;
  legacyExcluidas: number;
};

type AccountMeta = {
  id: string;
  client_number: string | null;
  is_legacy: boolean | null;
  ventana_revision: number | null;
  ventana_suspension: number | null;
};

type RepMeta = { id: string; full_name: string | null; email: string | null; active: boolean | null };

const SIN_VENDEDOR = "__sin_vendedor__";

/**
 * Carga todos los clientes con saldo vencido y los agrupa por vendedor.
 * Ordena los vendedores por monto vencido (mayor primero) y, dentro de cada
 * uno, los clientes por días vencidos (más atrasado primero).
 */
export async function loadCarteraVencida(supabase: DbClient): Promise<CarteraVencida> {
  const [balRes, accRes, repRes] = await Promise.all([
    supabase
      .from("v_account_balance")
      .select(
        "account_id, business_name, region, assigned_rep_id, saldo_pendiente, saldo_vencido, dias_vencido, facturas_abiertas, es_socio",
      ),
    supabase
      .from("accounts")
      .select("id, client_number, is_legacy, ventana_revision, ventana_suspension"),
    supabase.from("sales_reps").select("id, full_name, email, active"),
  ]);

  // Si una consulta falla, ABORTA. Nunca reportar "no hay clientes vencidos"
  // por un error de lectura: ese correo se leería como buenas noticias.
  for (const [nombre, res] of [
    ["v_account_balance", balRes],
    ["accounts", accRes],
    ["sales_reps", repRes],
  ] as const) {
    if (res.error) {
      throw new Error(`No se pudo leer ${nombre}: ${res.error.message}`);
    }
  }
  const { data: balances } = balRes;
  const { data: accounts } = accRes;
  const { data: reps } = repRes;

  const acctMeta = new Map(((accounts ?? []) as AccountMeta[]).map((a) => [a.id, a]));
  const repMeta = new Map(((reps ?? []) as RepMeta[]).map((r) => [r.id, r]));

  let legacyExcluidas = 0;
  const clientes: ClienteVencido[] = [];

  for (const b of (balances ?? []) as AccountBalance[]) {
    const saldoVencido = Number(b.saldo_vencido ?? 0);
    if (saldoVencido <= 0) continue; // socios y al corriente quedan fuera solos

    const meta = acctMeta.get(b.account_id);
    const riesgo = clasificarRiesgo({
      diasVencido: b.dias_vencido,
      saldoVencido,
      isLegacy: meta?.is_legacy,
      ventanaRevision: meta?.ventana_revision,
      ventanaSuspension: meta?.ventana_suspension,
    });
    // Legacy/estratégicas no entran a la lógica de suspensión ni al reporte
    // operativo; solo se cuentan para no ocultarlas.
    if (riesgo.clase === "Cartera Legacy") {
      legacyExcluidas++;
      continue;
    }

    clientes.push({
      accountId: b.account_id,
      nombre: b.business_name ?? "—",
      clientNumber: meta?.client_number ?? null,
      region: b.region ?? null,
      repId: b.assigned_rep_id ?? null,
      saldoPendiente: Number(b.saldo_pendiente ?? 0),
      saldoVencido,
      diasVencido: Number(b.dias_vencido ?? 0),
      facturasAbiertas: Number(b.facturas_abiertas ?? 0),
      clase: riesgo.clase,
    });
  }

  const byRep = new Map<string, ClienteVencido[]>();
  for (const c of clientes) {
    const key = c.repId ?? SIN_VENDEDOR;
    const arr = byRep.get(key) ?? [];
    arr.push(c);
    byRep.set(key, arr);
  }

  const vendedores: CarteraVendedor[] = [];
  for (const [key, lista] of byRep) {
    const rep = key === SIN_VENDEDOR ? null : repMeta.get(key);
    lista.sort((a, b) => b.diasVencido - a.diasVencido || b.saldoVencido - a.saldoVencido);
    vendedores.push({
      repId: key === SIN_VENDEDOR ? null : key,
      repName: rep?.full_name || (key === SIN_VENDEDOR ? "Sin vendedor asignado" : "—"),
      repEmail: rep?.active ? rep.email : null, // a los inactivos no se les escribe
      clientes: lista,
      totalVencido: lista.reduce((s, c) => s + c.saldoVencido, 0),
      suspendidos: lista.filter((c) => c.clase === "Suspender Crédito").length,
    });
  }
  vendedores.sort((a, b) => b.totalVencido - a.totalVencido);

  const suspendidos = clientes.filter((c) => c.clase === "Suspender Crédito");

  return {
    corte: new Date(),
    vendedores,
    totalClientes: clientes.length,
    totalVencido: clientes.reduce((s, c) => s + c.saldoVencido, 0),
    totalSuspendidos: suspendidos.length,
    vencidoSuspendidos: suspendidos.reduce((s, c) => s + c.saldoVencido, 0),
    legacyExcluidas,
  };
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

const COLOR: Record<ClaseRiesgo, string> = {
  "Suspender Crédito": "#b91c1c",
  "Por Revisar": "#b45309",
  "Crédito Liberado": "#166534",
  "Cartera Legacy": "#666",
};

const ETIQUETA: Record<ClaseRiesgo, string> = {
  "Suspender Crédito": "Crédito suspendido",
  "Por Revisar": "Por revisar",
  "Crédito Liberado": "Dentro de tolerancia",
  "Cartera Legacy": "Legacy",
};

const TH = 'style="padding:6px 10px;"';
const TH_R = 'style="padding:6px 10px;text-align:right;"';
const TD = 'style="padding:6px 10px;border-bottom:1px solid #eee;"';
const TD_R = 'style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;"';

function shell(titulo: string, corte: Date, cuerpo: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#222;font-size:14px;line-height:1.5;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — ${escapeHtml(titulo)}</h2>
    <p style="margin:0 0 20px;color:#666;">Corte al ${fmtFecha(corte)}</p>
    ${cuerpo}
    <p style="color:#666;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:12px;">
      Reporte automático de cobranza · TERAVINO CRM · se envía cada lunes.
    </p>
  </div>`;
}

function filaCliente(c: ClienteVencido, conVendedor: string | null): string {
  return `
    <tr>
      <td ${TD}>
        <strong>${escapeHtml(c.nombre)}</strong>
        ${c.clientNumber ? `<span style="color:#999;"> · ${escapeHtml(c.clientNumber)}</span>` : ""}
        ${c.region ? `<br><span style="color:#999;font-size:12px;">${escapeHtml(c.region)}</span>` : ""}
      </td>
      ${conVendedor != null ? `<td ${TD}>${escapeHtml(conVendedor)}</td>` : ""}
      <td ${TD_R}>${c.diasVencido}</td>
      <td ${TD_R}>${c.facturasAbiertas}</td>
      <td ${TD_R}><strong style="color:#b91c1c;">${fmt(c.saldoVencido)}</strong></td>
      <td ${TD_R}>${fmt(c.saldoPendiente)}</td>
      <td ${TD}><span style="color:${COLOR[c.clase]};font-weight:600;">${ETIQUETA[c.clase]}</span></td>
    </tr>`;
}

function tablaClientes(clientes: ClienteVencido[], vendedorPorFila: Map<string, string> | null): string {
  const filas = clientes
    .map((c) => filaCliente(c, vendedorPorFila ? vendedorPorFila.get(c.accountId) ?? "—" : null))
    .join("");
  return `
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 20px;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th ${TH}>Cliente</th>
          ${vendedorPorFila ? `<th ${TH}>Vendedor</th>` : ""}
          <th ${TH_R}>Días</th>
          <th ${TH_R}>Facturas</th>
          <th ${TH_R}>Saldo vencido</th>
          <th ${TH_R}>Saldo total</th>
          <th ${TH}>Estatus de crédito</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

/** Resumen general para Pedidos y Contabilidad: toda la cartera vencida. */
export function buildResumenGeneral(data: CarteraVencida): { subject: string; html: string } {
  if (!data.totalClientes) {
    return {
      subject: "Cobranza semanal — sin clientes con saldo vencido",
      html: shell(
        "Reporte semanal de cobranza",
        data.corte,
        `<p>No hay clientes con saldo vencido esta semana. 🎉</p>`,
      ),
    };
  }

  const resumenVendedores = data.vendedores
    .map(
      (v) => `
      <tr>
        <td ${TD}><strong>${escapeHtml(v.repName)}</strong></td>
        <td ${TD_R}>${v.clientes.length}</td>
        <td ${TD_R}><span style="color:#b91c1c;font-weight:600;">${v.suspendidos}</span></td>
        <td ${TD_R}><strong>${fmt(v.totalVencido)}</strong></td>
      </tr>`,
    )
    .join("");

  const nombrePorCuenta = new Map<string, string>();
  for (const v of data.vendedores) {
    for (const c of v.clientes) nombrePorCuenta.set(c.accountId, v.repName);
  }
  const todos = data.vendedores.flatMap((v) => v.clientes);

  const suspendidos = todos.filter((c) => c.clase === "Suspender Crédito");
  const porRevisar = todos.filter((c) => c.clase === "Por Revisar");
  const enTolerancia = todos.filter((c) => c.clase === "Crédito Liberado");

  const seccion = (titulo: string, color: string, nota: string, lista: ClienteVencido[]) =>
    lista.length
      ? `<h3 style="color:${color};margin:24px 0 2px;">${titulo} (${lista.length})</h3>
         <p style="margin:0 0 8px;color:#666;font-size:13px;">${nota}</p>
         ${tablaClientes(lista, nombrePorCuenta)}`
      : "";

  const cuerpo = `
    <table style="border-collapse:collapse;font-size:14px;margin:0 0 20px;">
      <tr><td style="padding:3px 12px 3px 0;color:#666;">Clientes con saldo vencido:</td><td style="padding:3px 0;font-weight:600;">${data.totalClientes}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#666;">Saldo vencido total:</td><td style="padding:3px 0;font-weight:600;color:#b91c1c;">${fmt(data.totalVencido)}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#666;">Con crédito para suspender:</td><td style="padding:3px 0;font-weight:600;color:#b91c1c;">${data.totalSuspendidos} · ${fmt(data.vencidoSuspendidos)}</td></tr>
    </table>

    <h3 style="color:#7a1220;margin:24px 0 2px;">Por vendedor</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 20px;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th ${TH}>Vendedor</th>
          <th ${TH_R}>Clientes vencidos</th>
          <th ${TH_R}>A suspender</th>
          <th ${TH_R}>Saldo vencido</th>
        </tr>
      </thead>
      <tbody>${resumenVendedores}</tbody>
    </table>

    ${seccion("Crédito suspendido", "#b91c1c", "No surtir pedidos hasta regularizar el saldo.", suspendidos)}
    ${seccion("Por revisar", "#b45309", "Dentro de la ventana de revisión: confirmar promesa de pago antes de surtir.", porRevisar)}
    ${seccion("Vencidos dentro de tolerancia", "#166534", "Aún no bloquean, pero ya tienen saldo vencido.", enTolerancia)}

    ${
      data.legacyExcluidas
        ? `<p style="color:#666;font-size:13px;">Nota: ${data.legacyExcluidas} cuenta${data.legacyExcluidas === 1 ? "" : "s"} marcada${data.legacyExcluidas === 1 ? "" : "s"} como <em>cartera legacy</em> quedaron fuera de este reporte por política (no entran a la lógica de suspensión).</p>`
        : ""
    }
    <p style="margin-top:20px;"><a href="${APP_URL}/cartera" style="color:#7a1220;">Abrir Cartera en el CRM →</a></p>`;

  return {
    subject: `Cobranza semanal — ${data.totalClientes} clientes vencidos · ${fmt(data.totalVencido)}`,
    html: shell("Reporte semanal de cobranza", data.corte, cuerpo),
  };
}

/** Reporte individual: solo la cartera vencida de ese vendedor. */
export function buildReporteVendedor(
  vendedor: CarteraVendedor,
  corte: Date,
): { subject: string; html: string } {
  const suspendidos = vendedor.clientes.filter((c) => c.clase === "Suspender Crédito");
  const porRevisar = vendedor.clientes.filter((c) => c.clase === "Por Revisar");
  const enTolerancia = vendedor.clientes.filter((c) => c.clase === "Crédito Liberado");

  const seccion = (titulo: string, color: string, nota: string, lista: ClienteVencido[]) =>
    lista.length
      ? `<h3 style="color:${color};margin:24px 0 2px;">${titulo} (${lista.length})</h3>
         <p style="margin:0 0 8px;color:#666;font-size:13px;">${nota}</p>
         ${tablaClientes(lista, null)}`
      : "";

  const cuerpo = `
    <p>Hola ${escapeHtml(vendedor.repName)},</p>
    <p>Esta es tu cartera con <strong>saldo vencido</strong> al día de hoy. Los clientes con
       <strong style="color:#b91c1c;">crédito suspendido</strong> no pueden recibir pedidos
       hasta que regularicen su saldo.</p>

    <table style="border-collapse:collapse;font-size:14px;margin:16px 0 4px;">
      <tr><td style="padding:3px 12px 3px 0;color:#666;">Clientes con saldo vencido:</td><td style="padding:3px 0;font-weight:600;">${vendedor.clientes.length}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#666;">Saldo vencido total:</td><td style="padding:3px 0;font-weight:600;color:#b91c1c;">${fmt(vendedor.totalVencido)}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#666;">Con crédito suspendido:</td><td style="padding:3px 0;font-weight:600;color:#b91c1c;">${vendedor.suspendidos}</td></tr>
    </table>

    ${seccion("Crédito suspendido — no surtir", "#b91c1c", "Contacta al cliente esta semana y gestiona el pago. Si ya pagó, sube el comprobante a Cartera.", suspendidos)}
    ${seccion("Por revisar", "#b45309", "Consigue una promesa de pago con fecha antes de levantar un pedido nuevo.", porRevisar)}
    ${seccion("Vencidos dentro de tolerancia", "#166534", "Todavía no bloquean, pero conviene recordarles el pago.", enTolerancia)}

    <p style="margin-top:20px;">Desde la ficha de cada cliente en el CRM puedes enviarle su
       <strong>estado de cuenta</strong> con un clic.</p>
    <p><a href="${APP_URL}/cartera" style="color:#7a1220;">Abrir Cartera en el CRM →</a></p>`;

  return {
    subject: `Tu cartera vencida — ${vendedor.clientes.length} ${vendedor.clientes.length === 1 ? "cliente" : "clientes"} · ${fmt(vendedor.totalVencido)}`,
    html: shell("Cobranza semanal — tu cartera", corte, cuerpo),
  };
}

// ---------------------------------------------------------------------------
// Armado de los envíos
// ---------------------------------------------------------------------------

export type EnvioReporte = {
  tipo: "general" | "vendedor";
  destinatario: string;
  /** Nombre legible del destinatario, para la bitácora/preview. */
  etiqueta: string;
  subject: string;
  html: string;
  clientes: number;
};

/** Destinatarios fijos del resumen general (Pedidos + Contabilidad). */
export function destinatariosGenerales(): string[] {
  const pedidos = process.env.PEDIDOS_EMAIL || "pedidos@teravino.com";
  const contabilidad = process.env.CONTABILIDAD_EMAIL || "contabilidad@teravino.com";
  const extra = (process.env.REPORTE_COBRANZA_EXTRA_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  // Dedup case-insensitive conservando el orden.
  const seen = new Set<string>();
  return [pedidos, contabilidad, ...extra].filter((e) => {
    const k = e.toLowerCase();
    if (!e.includes("@") || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Arma TODOS los correos del reporte semanal sin enviarlos.
 * Sirve igual para la vista previa y para el envío real.
 */
export async function buildReporteSemanal(supabase: DbClient): Promise<{
  data: CarteraVencida;
  envios: EnvioReporte[];
  /** Vendedores con cartera vencida pero sin email (o inactivos): no se les escribe. */
  sinEmail: string[];
}> {
  const data = await loadCarteraVencida(supabase);
  const envios: EnvioReporte[] = [];
  const sinEmail: string[] = [];

  const general = buildResumenGeneral(data);
  for (const to of destinatariosGenerales()) {
    envios.push({
      tipo: "general",
      destinatario: to,
      etiqueta: to,
      subject: general.subject,
      html: general.html,
      clientes: data.totalClientes,
    });
  }

  for (const v of data.vendedores) {
    if (!v.clientes.length) continue;
    if (!v.repEmail) {
      sinEmail.push(v.repName);
      continue;
    }
    const correo = buildReporteVendedor(v, data.corte);
    envios.push({
      tipo: "vendedor",
      destinatario: v.repEmail,
      etiqueta: v.repName,
      subject: correo.subject,
      html: correo.html,
      clientes: v.clientes.length,
    });
  }

  return { data, envios, sinEmail };
}

// ---------------------------------------------------------------------------
// Ejecución (vista previa / envío). Compartida por el cron y el envío manual.
// ---------------------------------------------------------------------------

export type OpcionesEnvio = {
  /** No envía nada: devuelve el plan de envío con el HTML de cada correo. */
  dry?: boolean;
  /** Modo prueba: manda TODO a esta dirección, con el asunto prefijado. */
  test?: string | null;
  /** Limita el envío a una de las dos piezas. */
  solo?: "general" | "vendedores" | null;
};

export type ResultadoReporte = {
  ok: boolean;
  dry: boolean;
  modoPrueba: boolean;
  corte: string;
  clientesVencidos: number;
  saldoVencido: number;
  creditoSuspendido: number;
  saldoSuspendido: number;
  legacyExcluidas: number;
  vendedoresSinEmail: string[];
  /** Solo en dry-run: el plan completo con el HTML de cada correo. */
  plan?: EnvioReporte[];
  enviados?: { tipo: string; a: string; etiqueta: string; id: string }[];
  errores?: string[];
};

export async function ejecutarReporteSemanal(
  supabase: DbClient,
  opts: OpcionesEnvio = {},
): Promise<ResultadoReporte> {
  const { dry = false, test = null, solo = null } = opts;
  const { data, envios, sinEmail } = await buildReporteSemanal(supabase);

  const seleccion = envios.filter((e) =>
    solo === "general" ? e.tipo === "general" : solo === "vendedores" ? e.tipo === "vendedor" : true,
  );

  const base = {
    dry,
    modoPrueba: Boolean(test),
    corte: data.corte.toISOString(),
    clientesVencidos: data.totalClientes,
    saldoVencido: data.totalVencido,
    creditoSuspendido: data.totalSuspendidos,
    saldoSuspendido: data.vencidoSuspendidos,
    legacyExcluidas: data.legacyExcluidas,
    vendedoresSinEmail: sinEmail,
  };

  // El plan siempre reporta el destinatario REAL, aunque haya modo prueba.
  if (dry) return { ok: true, ...base, plan: seleccion };

  const enviados: { tipo: string; a: string; etiqueta: string; id: string }[] = [];
  const errores: string[] = [];

  for (const e of seleccion) {
    const destino = test || e.destinatario;
    const subject = test ? `[PRUEBA · iba a ${e.destinatario}] ${e.subject}` : e.subject;
    try {
      const r = await sendEmail({ to: destino, subject, html: e.html, from: cobranzaFrom() });
      enviados.push({ tipo: e.tipo, a: destino, etiqueta: e.etiqueta, id: r.id });
    } catch (err) {
      errores.push(`${e.etiqueta} (${destino}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: errores.length === 0, ...base, enviados, errores };
}
