import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

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
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 11, marginBottom: 3 },
  th: { fontSize: 8, color: CARMESI, textTransform: "uppercase", letterSpacing: 1 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARMESI, paddingBottom: 5, marginBottom: 5 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#E8DDC8" },
  c1: { flex: 2 }, c2: { flex: 1.6 }, c3: { flex: 1.6 }, c4: { flex: 1.2 }, cR: { flex: 1.4, textAlign: "right" },
  totalsBlock: { marginTop: 14, alignSelf: "flex-end", width: 240 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsTotal: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: CARMESI },
  totalsLabel: { fontFamily: "Times-Roman", fontSize: 13, color: CARMESI },
  totalsValue: { fontFamily: "Times-Roman", fontSize: 15, color: CARMESI },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n);
const fmt = (x: string | null) => (x ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(x)) : "—");

export type StatementData = {
  account: { business_name: string; fiscal_name: string | null; rfc: string | null; region: string | null };
  generatedAt: string;
  totals: { facturado: number; pagado: number; pendiente: number; vencido: number };
  invoices: Array<{ invoice_number: string; invoice_date: string; due_date: string | null; total: number; total_paid: number; balance: number; status: string }>;
  payments: Array<{ payment_date: string; amount: number; method: string | null; reference: string | null }>;
};

export function StatementPdf({ data }: { data: StatementData }) {
  const { account, totals, invoices, payments } = data;
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
            <Text style={s.small}>Generado {fmt(data.generatedAt)}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={s.metaLabel}>Cliente</Text>
          <Text style={s.metaValue}>{account.business_name}</Text>
          {account.fiscal_name ? <Text style={s.small}>{account.fiscal_name}</Text> : null}
          {account.rfc ? <Text style={s.small}>RFC: {account.rfc}</Text> : null}
          {account.region ? <Text style={s.small}>{account.region}</Text> : null}
        </View>

        <Text style={s.h2}>Facturas</Text>
        <View style={s.tableHeader}>
          <Text style={[s.th, s.c1]}>Folio</Text>
          <Text style={[s.th, s.c2]}>Emisión</Text>
          <Text style={[s.th, s.c3]}>Vencimiento</Text>
          <Text style={[s.th, s.c4]}>Status</Text>
          <Text style={[s.th, s.cR]}>Total</Text>
          <Text style={[s.th, s.cR]}>Pagado</Text>
          <Text style={[s.th, s.cR]}>Saldo</Text>
        </View>
        {invoices.map((i, idx) => (
          <View key={idx} style={s.row} wrap={false}>
            <Text style={s.c1}>{i.invoice_number}</Text>
            <Text style={s.c2}>{fmt(i.invoice_date)}</Text>
            <Text style={s.c3}>{fmt(i.due_date)}</Text>
            <Text style={s.c4}>{i.status}</Text>
            <Text style={s.cR}>{mxn(i.total)}</Text>
            <Text style={s.cR}>{mxn(i.total_paid)}</Text>
            <Text style={s.cR}>{mxn(i.balance)}</Text>
          </View>
        ))}

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

        <View style={s.footer} fixed>
          <Text>TERAVINO — Distribuidora premium HORECA</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
