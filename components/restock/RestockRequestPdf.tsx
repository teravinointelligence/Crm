import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type RestockRequestPdfData = {
  requestNumber: string;
  vendedor: string;
  region: string;
  fulfillment: string;
  status: string;
  createdAt: string;
  notes: string | null;
  items: Array<{
    productName: string;
    supplier: string;
    requested: number;
    approved: number | null;
    notes: string | null;
  }>;
};

const styles = StyleSheet.create({
  page: { padding: 38, fontFamily: "Helvetica", fontSize: 9, color: "#241e20" },
  eyebrow: { color: "#7a1220", fontSize: 8, letterSpacing: 1.4, marginBottom: 8 },
  title: { fontSize: 23, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  subtitle: { color: "#6f676a", fontSize: 10, marginBottom: 18 },
  meta: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "#f7f2ec", padding: 12, marginBottom: 18 },
  metaItem: { width: "50%", marginBottom: 5 },
  metaLabel: { color: "#7a1220", fontSize: 7, marginBottom: 2 },
  section: { color: "#7a1220", fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 7 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ded4cc", minHeight: 24, alignItems: "center" },
  header: { backgroundColor: "#7a1220", color: "#ffffff", fontFamily: "Helvetica-Bold" },
  product: { width: "42%", padding: 6 },
  supplier: { width: "25%", padding: 6 },
  qty: { width: "12%", padding: 6, textAlign: "right" },
  note: { width: "21%", padding: 6, color: "#6f676a" },
  notesBox: { marginTop: 16, padding: 10, borderWidth: 0.7, borderColor: "#ded4cc" },
  footer: { position: "absolute", left: 38, right: 38, bottom: 24, borderTopWidth: 0.5, borderTopColor: "#ded4cc", paddingTop: 6, color: "#6f676a", fontSize: 7, flexDirection: "row", justifyContent: "space-between" },
});

export function RestockRequestPdf({ data }: { data: RestockRequestPdfData }) {
  const total = data.items.reduce((sum, item) => sum + item.requested, 0);
  return (
    <Document title={`Pedido de restock ${data.requestNumber}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.eyebrow}>TERAVINO - PEDIDO DE RESTOCK</Text>
        <Text style={styles.title}>{data.requestNumber}</Text>
        <Text style={styles.subtitle}>{data.vendedor} - {data.createdAt}</Text>

        <View style={styles.meta}>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>VENDEDOR</Text><Text>{data.vendedor}</Text></View>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>REGION DESTINO</Text><Text>{data.region}</Text></View>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>TIPO DE SURTIDO</Text><Text>{data.fulfillment}</Text></View>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>ESTATUS</Text><Text>{data.status}</Text></View>
        </View>

        <Text style={styles.section}>PRODUCTOS SOLICITADOS - {total} UNIDADES</Text>
        <View style={[styles.row, styles.header]} fixed>
          <Text style={styles.product}>Producto</Text><Text style={styles.supplier}>Proveedor</Text>
          <Text style={styles.qty}>Pedido</Text><Text style={[styles.note, { color: "#ffffff" }]}>Nota</Text>
        </View>
        {data.items.map((item, index) => (
          <View key={`${item.productName}-${index}`} style={styles.row} wrap={false}>
            <Text style={styles.product}>{item.productName}</Text><Text style={styles.supplier}>{item.supplier}</Text>
            <Text style={styles.qty}>{item.requested}</Text><Text style={styles.note}>{item.notes ?? "-"}</Text>
          </View>
        ))}
        {data.notes ? <View style={styles.notesBox}><Text style={styles.metaLabel}>NOTAS GENERALES</Text><Text>{data.notes}</Text></View> : null}
        <View style={styles.footer} fixed>
          <Text>TERAVINO Wine & Spirits</Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
