import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const COLOR_CARMESI = "#A91E3A";
const COLOR_ORO = "#c9a96e";
const COLOR_TINTA = "#1F1A1C";
const COLOR_CREMA = "#FAF7F2";
const COLOR_MUTED = "#7A6E70";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLOR_TINTA,
    backgroundColor: COLOR_CREMA,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: COLOR_CARMESI,
    paddingBottom: 10,
    marginBottom: 18,
  },
  wordmark: {
    fontSize: 22,
    letterSpacing: 5,
    color: COLOR_CARMESI,
    fontFamily: "Times-Roman",
  },
  small: { fontSize: 9, color: COLOR_MUTED },
  h1: { fontSize: 18, color: COLOR_CARMESI, marginBottom: 2, fontFamily: "Times-Roman" },
  h2: { fontSize: 11, color: COLOR_CARMESI, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  metaBlock: { flexDirection: "column" },
  metaLabel: { fontSize: 8, color: COLOR_MUTED, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 11, marginBottom: 4 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOR_CARMESI,
    paddingBottom: 6,
    marginBottom: 6,
  },
  th: { fontSize: 9, color: COLOR_CARMESI, textTransform: "uppercase", letterSpacing: 1 },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E8DDC8",
  },
  colName: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1.4, textAlign: "right" },
  colTotal: { flex: 1.4, textAlign: "right" },
  productName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  productMeta: { fontSize: 9, color: COLOR_MUTED },
  totalsBlock: {
    marginTop: 16,
    alignSelf: "flex-end",
    width: 220,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLOR_CARMESI,
  },
  totalsTotalLabel: {
    fontFamily: "Times-Roman",
    fontSize: 14,
    color: COLOR_CARMESI,
  },
  totalsTotalValue: {
    fontFamily: "Times-Roman",
    fontSize: 16,
    color: COLOR_CARMESI,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: COLOR_ORO,
    paddingTop: 8,
    fontSize: 8,
    color: COLOR_MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  notes: {
    fontSize: 9,
    color: COLOR_TINTA,
    marginTop: 16,
    padding: 10,
    backgroundColor: "#F1E6D080",
    borderLeftWidth: 2,
    borderLeftColor: COLOR_ORO,
  },
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);

const fmtDate = (s: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(s));

export type OrderPdfData = {
  order: {
    order_number: string;
    order_type: string;
    order_date: string;
    notes: string | null;
    subtotal: number;
    iva: number;
    total: number;
    discount_pct?: number;
    discount_amount?: number;
  };
  account: {
    business_name: string;
    fiscal_name: string | null;
    rfc: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
  };
  rep: { full_name: string; email: string } | null;
  items: Array<{
    product_name: string;
    supplier: string | null;
    vintage: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

export function OrderPdf({ data }: { data: OrderPdfData }) {
  const { order, account, rep, items } = data;
  const docTitle =
    order.order_type === "pedido" ? "Pedido" : "Cotización";

  return (
    <Document title={`${docTitle} ${order.order_number}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>TERAVINO</Text>
            <Text style={styles.small}>
              TERAVINO, S.A. de C.V. · RFC: TER170509L72
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.h1}>{docTitle}</Text>
            <Text style={styles.metaValue}>{order.order_number}</Text>
            <Text style={styles.small}>{fmtDate(order.order_date)}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Cliente</Text>
            <Text style={styles.metaValue}>{account.business_name}</Text>
            {account.fiscal_name && (
              <Text style={styles.small}>{account.fiscal_name}</Text>
            )}
            {account.rfc && <Text style={styles.small}>RFC: {account.rfc}</Text>}
            {(account.address || account.city || account.region) && (
              <Text style={styles.small}>
                {[account.address, account.city, account.region]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            )}
          </View>
          {rep && (
            <View style={[styles.metaBlock, { alignItems: "flex-end" }]}>
              <Text style={styles.metaLabel}>Atendido por</Text>
              <Text style={styles.metaValue}>{rep.full_name}</Text>
              <Text style={styles.small}>{rep.email}</Text>
            </View>
          )}
        </View>

        <Text style={styles.h2}>Productos</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colName]}>Producto</Text>
          <Text style={[styles.th, styles.colQty]}>Cant.</Text>
          <Text style={[styles.th, styles.colPrice]}>Precio</Text>
          <Text style={[styles.th, styles.colTotal]}>Total</Text>
        </View>
        {items.map((i, idx) => (
          <View key={idx} style={styles.row} wrap={false}>
            <View style={styles.colName}>
              <Text style={styles.productName}>{i.product_name}</Text>
              {(i.supplier || i.vintage) && (
                <Text style={styles.productMeta}>
                  {[i.supplier, i.vintage].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
            <Text style={styles.colQty}>{i.quantity}</Text>
            <Text style={styles.colPrice}>{mxn(i.unit_price)}</Text>
            <Text style={styles.colTotal}>{mxn(i.line_total)}</Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{mxn(order.subtotal)}</Text>
          </View>
          {(order.discount_amount ?? 0) > 0 && (
            <View style={styles.totalsRow}>
              <Text style={{ color: COLOR_CARMESI }}>
                Descuento{order.discount_pct ? ` (${order.discount_pct}%)` : ""}
              </Text>
              <Text style={{ color: COLOR_CARMESI }}>- {mxn(order.discount_amount ?? 0)}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text style={{ color: COLOR_MUTED }}>IVA 16%</Text>
            <Text style={{ color: COLOR_MUTED }}>{mxn(order.iva)}</Text>
          </View>
          <View style={styles.totalsTotal}>
            <Text style={styles.totalsTotalLabel}>Total</Text>
            <Text style={styles.totalsTotalValue}>{mxn(order.total)}</Text>
          </View>
        </View>

        {order.notes && (
          <View style={styles.notes}>
            <Text>{order.notes}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>TERAVINO — Distribuidora premium HORECA · Los Cabos · La Paz · Vallarta · Tijuana</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
