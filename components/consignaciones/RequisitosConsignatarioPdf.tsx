// PDF de "Requisitos para consignación" con el membrete TERAVINO. Lista los
// documentos y datos que se le piden al consignatario. Contenido desde
// lib/consignaciones-requisitos.ts (misma fuente que el correo).

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  REQUISITOS_CONSIGNATARIO,
  REQUISITOS_TITULO,
  REQUISITOS_NOTA,
} from "@/lib/consignaciones-requisitos";

const CARMESI = "#A91E3A";
const ORO = "#c9a96e";
const TINTA = "#1F1A1C";
const CREMA = "#FAF7F2";
const MUTED = "#7A6E70";

const s = StyleSheet.create({
  page: { padding: 48, paddingBottom: 64, fontFamily: "Helvetica", fontSize: 10, color: TINTA, backgroundColor: CREMA },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: CARMESI, paddingBottom: 10, marginBottom: 18 },
  wordmark: { fontSize: 22, letterSpacing: 5, color: CARMESI, fontFamily: "Times-Roman" },
  small: { fontSize: 9, color: MUTED },
  h1: { fontSize: 15, color: CARMESI, fontFamily: "Times-Roman" },
  cliente: { fontSize: 10, marginBottom: 16 },
  seccion: { marginBottom: 16 },
  seccionTitulo: { fontSize: 12, color: CARMESI, fontFamily: "Times-Roman", marginBottom: 4 },
  intro: { fontSize: 10, lineHeight: 1.5, marginBottom: 8 },
  item: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 14, color: CARMESI },
  itemText: { flex: 1, fontSize: 10, lineHeight: 1.4 },
  nota: { marginTop: 12, fontSize: 9.5, lineHeight: 1.5, color: MUTED, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 10 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

export function RequisitosConsignatarioPdf({ clientName }: { clientName?: string | null }) {
  return (
    <Document title={REQUISITOS_TITULO}>
      <Page size="LETTER" style={s.page} wrap>
        <View style={s.header} fixed>
          <View>
            <Text style={s.wordmark}>TERAVINO</Text>
            <Text style={s.small}>TERAVINO, S.A. de C.V. · RFC: TER170509L72</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>{REQUISITOS_TITULO}</Text>
          </View>
        </View>

        {clientName ? <Text style={s.cliente}>Cliente: {clientName}</Text> : null}

        {REQUISITOS_CONSIGNATARIO.map((sec, i) => (
          <View key={i} style={s.seccion} wrap={false}>
            <Text style={s.seccionTitulo}>{sec.titulo}</Text>
            {sec.intro ? <Text style={s.intro}>{sec.intro}</Text> : null}
            {sec.items.map((it, j) => (
              <View key={j} style={s.item}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.itemText}>{it}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={s.nota}>{REQUISITOS_NOTA}</Text>

        <View style={s.footer} fixed>
          <Text>TERAVINO — Distribuidora premium HORECA</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
