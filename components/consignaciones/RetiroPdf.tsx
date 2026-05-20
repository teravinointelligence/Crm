import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const CARMESI = "#A91E3A";
const ORO = "#c9a96e";
const TINTA = "#1F1A1C";
const CREMA = "#FAF7F2";
const MUTED = "#7A6E70";

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: TINTA, backgroundColor: CREMA },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: CARMESI, paddingBottom: 10, marginBottom: 18 },
  wordmark: { fontSize: 22, letterSpacing: 5, color: CARMESI, fontFamily: "Times-Roman" },
  small: { fontSize: 8.5, color: MUTED },
  h1: { fontSize: 16, color: CARMESI, fontFamily: "Times-Roman" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 11, marginBottom: 3 },
  th: { fontSize: 8, color: CARMESI, textTransform: "uppercase", letterSpacing: 1 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARMESI, paddingBottom: 5, marginBottom: 5 },
  row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#E8DDC8" },
  cCod: { flex: 1.4 }, cProd: { flex: 3 }, cMot: { flex: 2.4 }, cCant: { flex: 0.9, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totalBox: { flexDirection: "row", justifyContent: "space-between", width: 220, borderTopWidth: 1, borderTopColor: CARMESI, paddingTop: 8 },
  totalLabel: { fontFamily: "Times-Roman", fontSize: 13, color: CARMESI },
  totalValue: { fontFamily: "Times-Roman", fontSize: 15, color: CARMESI },
  firmas: { flexDirection: "row", justifyContent: "space-between", marginTop: 56 },
  firmaBox: { width: 200, borderTopWidth: 1, borderTopColor: TINTA, paddingTop: 6, alignItems: "center" },
  notas: { marginTop: 18, fontSize: 9, color: MUTED },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

const fmt = (x: string | null | undefined) =>
  x ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(x)) : "—";

export type RetiroPdfData = {
  numero_retiro: string;
  fecha: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  consignacion_numero: string;
  items: Array<{ codigo?: string; producto_nombre: string; cantidad: number; motivo?: string }>;
  total_unidades: number;
  notas?: string;
  generatedAt: string;
};

export function RetiroPdf({ data }: { data: RetiroPdfData }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.wordmark}>TERAVINO</Text>
            <Text style={s.small}>Retiro de producto en consignación</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>{data.numero_retiro}</Text>
            <Text style={s.small}>{fmt(data.fecha)}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          <View>
            <Text style={s.metaLabel}>Cliente</Text>
            <Text style={s.metaValue}>{data.cliente_nombre || "—"}</Text>
            <Text style={s.metaLabel}>Consignación</Text>
            <Text style={s.metaValue}>{data.consignacion_numero || "—"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.metaLabel}>Vendedor</Text>
            <Text style={s.metaValue}>{data.vendedor_nombre || "—"}</Text>
          </View>
        </View>

        <View style={s.tableHeader}>
          <Text style={[s.th, s.cCod]}>Código</Text>
          <Text style={[s.th, s.cProd]}>Producto</Text>
          <Text style={[s.th, s.cMot]}>Motivo</Text>
          <Text style={[s.th, s.cCant]}>Cant.</Text>
        </View>
        {data.items.map((it, i) => (
          <View key={i} style={s.row}>
            <Text style={s.cCod}>{it.codigo ?? "—"}</Text>
            <Text style={s.cProd}>{it.producto_nombre}</Text>
            <Text style={s.cMot}>{it.motivo ?? "—"}</Text>
            <Text style={s.cCant}>{it.cantidad}</Text>
          </View>
        ))}

        <View style={s.totalRow}>
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>Total unidades</Text>
            <Text style={s.totalValue}>{data.total_unidades}</Text>
          </View>
        </View>

        {data.notas ? <Text style={s.notas}>Notas: {data.notas}</Text> : null}

        <View style={s.firmas}>
          <View style={s.firmaBox}><Text style={s.small}>Entrega (cliente)</Text></View>
          <View style={s.firmaBox}><Text style={s.small}>Recibe (TERAVINO)</Text></View>
        </View>

        <View style={s.footer} fixed>
          <Text>TERAVINO, S.A. de C.V.</Text>
          <Text>Generado {fmt(data.generatedAt)}</Text>
        </View>
      </Page>
    </Document>
  );
}
