import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { bucketDeDias, BUCKET_LABEL, pctDelSaldo } from "@/lib/cartera";

const CARMESI = "#A91E3A";
const ORO = "#c9a96e";
const TINTA = "#1F1A1C";
const CREMA = "#FAF7F2";
const MUTED = "#7A6E70";

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 9.5, color: TINTA, backgroundColor: CREMA },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: CARMESI, paddingBottom: 10, marginBottom: 18 },
  wordmark: { fontSize: 22, letterSpacing: 5, color: CARMESI, fontFamily: "Times-Roman" },
  small: { fontSize: 8.5, color: MUTED },
  h1: { fontSize: 16, color: CARMESI, fontFamily: "Times-Roman" },
  h2: { fontSize: 10, color: CARMESI, textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 6 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap" },
  metaItem: { width: "33%", marginBottom: 6 },
  metaLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 10 },
  th: { fontSize: 8, color: CARMESI, textTransform: "uppercase", letterSpacing: 1 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARMESI, paddingBottom: 5, marginBottom: 5 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#E8DDC8" },
  totalRow: { flexDirection: "row", paddingVertical: 5, borderTopWidth: 1, borderTopColor: CARMESI, marginTop: 2 },
  c1: { flex: 2 }, c2: { flex: 1.6 }, c3: { flex: 1.6 }, c4: { flex: 1.2 }, cR: { flex: 1.4, textAlign: "right" },
  totalsBlock: { marginTop: 14, alignSelf: "flex-end", width: 260 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsTotal: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: CARMESI },
  totalsLabel: { fontFamily: "Times-Roman", fontSize: 13, color: CARMESI },
  totalsValue: { fontFamily: "Times-Roman", fontSize: 15, color: CARMESI },
  riesgoBox: { borderWidth: 1, borderColor: CARMESI, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 8, alignSelf: "flex-start" },
  note: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n);
const fmt = (x: string | null) => (x ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(x)) : "—");

export type StatementData = {
  account: {
    business_name: string;
    fiscal_name: string | null;
    rfc: string | null;
    region: string | null;
    city: string | null;
    client_number: string | null;
    vendedor: string | null;
    dias_pago: string | null;
    dias_revision: string | null;
    credito: string;
  };
  generatedAt: string;
  creditDays: number;
  riesgo: string;
  totals: { facturado: number; pagado: number; pendiente: number; vencido: number; netoEstimado: number | null };
  aging?: { b_1_31: number; b_32_62: number; b_63_93: number; b_94_mas: number; saldo_total: number } | null;
  pendientes: Array<{ fecha: string | null; banco: string; referencia: string; folios: string; importe: number }>;
  invoices: Array<{ invoice_number: string; invoice_date: string; due_date: string | null; total: number; total_paid: number; balance: number; status: string }>;
  payments: Array<{ payment_date: string; amount: number; method: string | null; reference: string | null }>;
};

const agingStyles = StyleSheet.create({
  hdr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARMESI, paddingBottom: 4, marginBottom: 3 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#E8DDC8" },
  total: { flexDirection: "row", paddingVertical: 4, borderTopWidth: 1, borderTopColor: CARMESI, marginTop: 1 },
  cLabel: { flex: 2 }, cVal: { flex: 1.5, textAlign: "right" }, cPct: { flex: 1, textAlign: "right" },
});

function diasVencidosDe(invoiceDate: string, creditDays: number, corte: string) {
  const venc = new Date(invoiceDate);
  venc.setDate(venc.getDate() + creditDays);
  return Math.floor((new Date(corte).getTime() - venc.getTime()) / 86400000);
}

export function StatementPdf({ data }: { data: StatementData }) {
  const { account, totals, invoices, payments, aging, pendientes, riesgo, creditDays, generatedAt } = data;
  const agingTotal = aging?.saldo_total ?? 0;
  const totalSaldoFacturas = invoices.reduce((acc, i) => acc + i.balance, 0);

  return (
    <Document title={`Estado de cuenta ${account.business_name}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.wordmark}>TERAVINO</Text>
            <Text style={s.small}>TERAVINO, S.A. de C.V. · RFC: TER170509L72</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>Estado de cuenta</Text>
            <Text style={s.small}>Corte {fmt(generatedAt)}</Text>
          </View>
        </View>

        {/* Sección 1 — datos del cliente */}
        <Text style={{ fontSize: 13, color: CARMESI, fontFamily: "Times-Roman", marginBottom: 8 }}>
          {account.business_name}
          {account.client_number ? `  ·  Cliente ${account.client_number}` : ""}
        </Text>
        <View style={s.metaGrid}>
          <Meta label="Razón social" value={account.fiscal_name} />
          <Meta label="RFC" value={account.rfc} />
          <Meta label="Vendedor" value={account.vendedor} />
          <Meta label="Ubicación" value={[account.region, account.city].filter(Boolean).join(" · ")} />
          <Meta label="Días de pago" value={account.dias_pago} />
          <Meta label="Días de revisión" value={account.dias_revision} />
          <Meta label="Crédito" value={account.credito} />
        </View>

        {/* Sección 2 — saldo y riesgo */}
        <Text style={s.h2}>Saldo y riesgo</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={s.riesgoBox}>
            <Text style={{ fontSize: 10, color: CARMESI }}>{riesgo}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {totals.netoEstimado != null && (
              <Text style={s.small}>Saldo neto estimado: {mxn(totals.netoEstimado)} (por confirmar abonos)</Text>
            )}
          </View>
        </View>

        {/* Sección 3 — resumen por antigüedad */}
        {aging && agingTotal > 0 && (
          <>
            <Text style={s.h2}>Resumen por antigüedad</Text>
            <View style={agingStyles.hdr}>
              <Text style={[s.th, agingStyles.cLabel]}>Antigüedad</Text>
              <Text style={[s.th, agingStyles.cVal]}>Importe</Text>
              <Text style={[s.th, agingStyles.cPct]}>% saldo</Text>
            </View>
            {(["b_1_31", "b_32_62", "b_63_93", "b_94_mas"] as const).map((k) => (
              <View key={k} style={agingStyles.row}>
                <Text style={agingStyles.cLabel}>{BUCKET_LABEL[k]}</Text>
                <Text style={agingStyles.cVal}>{mxn(aging[k])}</Text>
                <Text style={agingStyles.cPct}>{pctDelSaldo(aging[k], agingTotal).toFixed(1)}%</Text>
              </View>
            ))}
            <View style={agingStyles.total}>
              <Text style={[agingStyles.cLabel, { color: CARMESI }]}>Total</Text>
              <Text style={[agingStyles.cVal, { color: CARMESI }]}>{mxn(agingTotal)}</Text>
              <Text style={[agingStyles.cPct, { color: CARMESI }]}>100%</Text>
            </View>
          </>
        )}

        {/* Sección 5 — abonos pendientes de aplicar */}
        {pendientes.length > 0 && (
          <>
            <Text style={s.h2}>Abonos detectados pendientes de aplicar</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, s.c2]}>Fecha</Text>
              <Text style={[s.th, s.c1]}>Banco / referencia</Text>
              <Text style={[s.th, s.c1]}>Folios</Text>
              <Text style={[s.th, s.cR]}>Importe</Text>
            </View>
            {pendientes.map((p, idx) => (
              <View key={idx} style={s.row} wrap={false}>
                <Text style={s.c2}>{fmt(p.fecha)}</Text>
                <Text style={s.c1}>{[p.banco, p.referencia].filter((x) => x && x !== "—").join(" · ") || "—"}</Text>
                <Text style={s.c1}>{p.folios}</Text>
                <Text style={s.cR}>{mxn(p.importe)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Sección 6 — detalle de facturas (vieja → nueva) */}
        <Text style={s.h2}>Detalle de facturas</Text>
        <View style={s.tableHeader}>
          <Text style={[s.th, s.c2]}>Fecha</Text>
          <Text style={[s.th, s.c1]}>Serie-Folio</Text>
          <Text style={[s.th, s.cR]}>Días venc.</Text>
          <Text style={[s.th, s.c3]}>Antigüedad</Text>
          <Text style={[s.th, s.cR]}>Importe</Text>
        </View>
        {invoices.map((i, idx) => {
          const open = i.balance > 0;
          const dv = diasVencidosDe(i.invoice_date, creditDays, generatedAt);
          const bucket = open && dv > 0 ? bucketDeDias(dv) : null;
          return (
            <View key={idx} style={s.row} wrap={false}>
              <Text style={s.c2}>{fmt(i.invoice_date)}</Text>
              <Text style={s.c1}>{i.invoice_number}</Text>
              <Text style={s.cR}>{open && dv > 0 ? `${dv} d` : "—"}</Text>
              <Text style={s.c3}>{bucket ? BUCKET_LABEL[bucket] : open ? "Por vencer" : "Pagada"}</Text>
              <Text style={s.cR}>{mxn(i.balance)}</Text>
            </View>
          );
        })}
        <View style={s.totalRow}>
          <Text style={[s.c2, { color: CARMESI }]}>TOTAL</Text>
          <Text style={s.c1}></Text>
          <Text style={s.cR}></Text>
          <Text style={s.c3}></Text>
          <Text style={[s.cR, { color: CARMESI }]}>{mxn(totalSaldoFacturas)}</Text>
        </View>

        {payments.length > 0 && (
          <>
            <Text style={s.h2}>Pagos</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, s.c2]}>Fecha</Text>
              <Text style={[s.th, s.c3]}>Método</Text>
              <Text style={[s.th, s.c1]}>Referencia</Text>
              <Text style={[s.th, s.cR]}>Monto</Text>
            </View>
            {payments.map((p, idx) => (
              <View key={idx} style={s.row} wrap={false}>
                <Text style={s.c2}>{fmt(p.payment_date)}</Text>
                <Text style={s.c3}>{p.method ?? "—"}</Text>
                <Text style={s.c1}>{p.reference ?? "—"}</Text>
                <Text style={s.cR}>{mxn(p.amount)}</Text>
              </View>
            ))}
          </>
        )}

        <View style={s.totalsBlock}>
          <View style={s.totalsRow}><Text>Total facturado</Text><Text>{mxn(totals.facturado)}</Text></View>
          <View style={s.totalsRow}><Text style={{ color: MUTED }}>Total pagado</Text><Text style={{ color: MUTED }}>{mxn(totals.pagado)}</Text></View>
          <View style={s.totalsRow}><Text style={{ color: MUTED }}>Saldo vencido</Text><Text style={{ color: MUTED }}>{mxn(totals.vencido)}</Text></View>
          <View style={s.totalsTotal}><Text style={s.totalsLabel}>Saldo pendiente</Text><Text style={s.totalsValue}>{mxn(totals.pendiente)}</Text></View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={s.note}>· CONTPAQ guarda vencimiento = fecha de factura; para crédito negociado los días/bucket se recalculan con los días pactados.</Text>
          <Text style={s.note}>· La aplicación de pagos por coincidencia de importe es estimada hasta confirmar en COMPAC.</Text>
          <Text style={s.note}>· Cuentas legacy/estratégicas se excluyen de métricas operativas.</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>TERAVINO — Distribuidora premium HORECA</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={s.metaItem}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value || "—"}</Text>
    </View>
  );
}
