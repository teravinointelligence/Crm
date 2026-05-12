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
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: TINTA, backgroundColor: CREMA },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: CARMESI, paddingBottom: 10, marginBottom: 18 },
  wordmark: { fontSize: 22, letterSpacing: 5, color: CARMESI, fontFamily: "Times-Roman" },
  small: { fontSize: 9, color: MUTED },
  h1: { fontSize: 17, color: CARMESI, fontFamily: "Times-Roman" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 11, marginBottom: 3 },
  h2: { fontSize: 11, color: CARMESI, textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARMESI, paddingBottom: 6, marginBottom: 6 },
  th: { fontSize: 9, color: CARMESI, textTransform: "uppercase", letterSpacing: 1 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#E8DDC8" },
  colName: { flex: 4 }, colSup: { flex: 2.5 }, colQty: { flex: 1.2, textAlign: "right" }, colNote: { flex: 3 },
  productName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalBlock: { marginTop: 14, alignSelf: "flex-end", flexDirection: "row", gap: 12 },
  totalLabel: { fontFamily: "Times-Roman", fontSize: 13, color: CARMESI },
  totalValue: { fontFamily: "Times-Roman", fontSize: 15, color: CARMESI },
  notes: { fontSize: 9, color: TINTA, marginTop: 16, padding: 10, backgroundColor: "#F1E6D080", borderLeftWidth: 2, borderLeftColor: ORO },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
  badge: { fontSize: 9, color: CARMESI, borderWidth: 1, borderColor: CARMESI, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
});

const fmt = (x: string | null) => (x ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(x)) : "—");

export type SampleRequestPdfData = {
  request_number: string;
  status: string;
  created_at: string | null;
  reason: string | null;
  notes: string | null;
  review_notes: string | null;
  rep: { full_name: string } | null;
  reviewer: { full_name: string } | null;
  account: { business_name: string; region: string | null } | null;
  items: Array<{ product_name: string; supplier: string | null; quantity: number; notes: string | null }>;
};

export function SampleRequestPdf({ data }: { data: SampleRequestPdfData }) {
  const totalBottles = data.items.reduce((t, i) => t + Number(i.quantity ?? 0), 0);
  return (
    <Document title={`Solicitud de muestras ${data.request_number}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.wordmark}>TERAVINO</Text>
            <Text style={s.small}>TERAVINO, S.A. de C.V. · RFC: TER170509L72</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>Solicitud de muestras</Text>
            <Text style={s.metaValue}>{data.request_number}</Text>
            <Text style={s.small}>{fmt(data.created_at)}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          <View>
            <Text style={s.metaLabel}>Solicitante</Text>
            <Text style={s.metaValue}>{data.rep?.full_name ?? "—"}</Text>
            {data.account ? (
              <>
                <Text style={s.metaLabel}>Para el cliente</Text>
                <Text style={s.metaValue}>
                  {data.account.business_name}
                  {data.account.region ? ` · ${data.account.region}` : ""}
                </Text>
              </>
            ) : null}
            {data.reason ? (
              <>
                <Text style={s.metaLabel}>Motivo</Text>
                <Text style={s.small}>{data.reason}</Text>
              </>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.badge}>{data.status.toUpperCase()}</Text>
            {data.reviewer ? (
              <Text style={[s.small, { marginTop: 6 }]}>Aprobado por {data.reviewer.full_name}</Text>
            ) : null}
          </View>
        </View>

        <Text style={s.h2}>Vinos solicitados</Text>
        <View style={s.tableHeader}>
          <Text style={[s.th, s.colName]}>Vino</Text>
          <Text style={[s.th, s.colSup]}>Bodega</Text>
          <Text style={[s.th, s.colQty]}>Botellas</Text>
          <Text style={[s.th, s.colNote]}>Nota</Text>
        </View>
        {data.items.map((i, idx) => (
          <View key={idx} style={s.row} wrap={false}>
            <Text style={[s.productName, s.colName]}>{i.product_name}</Text>
            <Text style={s.colSup}>{i.supplier ?? "—"}</Text>
            <Text style={s.colQty}>{i.quantity}</Text>
            <Text style={s.colNote}>{i.notes ?? ""}</Text>
          </View>
        ))}

        <View style={s.totalBlock}>
          <Text style={s.totalLabel}>Total de botellas</Text>
          <Text style={s.totalValue}>{totalBottles}</Text>
        </View>

        {data.review_notes ? (
          <View style={s.notes}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Notas de revisión:</Text>
            <Text>{data.review_notes}</Text>
          </View>
        ) : null}
        {data.notes ? (
          <View style={s.notes}>
            <Text>{data.notes}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>TERAVINO — Distribuidora premium HORECA</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
