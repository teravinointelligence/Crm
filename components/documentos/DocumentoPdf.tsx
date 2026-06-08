// PDF de un documento generado en Teravino Docs. Renderiza el texto del
// documento (ya con los datos del cliente sustituidos) con el membrete TERAVINO,
// respetando saltos de línea y dejando que los bloques de firma queden juntos.

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

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
  metaValue: { fontSize: 10 },
  body: { fontSize: 10, lineHeight: 1.5, color: TINTA },
  para: { marginBottom: 7 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

export type DocumentoPdfData = {
  title: string;
  numero?: string | null;
  clientName?: string | null;
  templateName?: string | null;
  content: string;
};

// Partimos el texto en párrafos por líneas en blanco para que el PDF respete la
// estructura del documento y no corte los bloques de firma a la mitad.
function toParagraphs(content: string): string[] {
  return content.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim());
}

export function DocumentoPdf({ data }: { data: DocumentoPdfData }) {
  const paragraphs = toParagraphs(data.content);
  return (
    <Document title={data.title}>
      <Page size="LETTER" style={s.page} wrap>
        <View style={s.header} fixed>
          <View>
            <Text style={s.wordmark}>TERAVINO</Text>
            <Text style={s.small}>TERAVINO, S.A. de C.V. · RFC: TER170509L72</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>{data.templateName ?? "Documento"}</Text>
            {data.numero ? <Text style={s.metaValue}>{data.numero}</Text> : null}
            {data.clientName ? <Text style={s.small}>{data.clientName}</Text> : null}
          </View>
        </View>

        <View style={s.body}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={s.para} wrap={!isSignatureBlock(p)}>
              {p}
            </Text>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text>TERAVINO — Distribuidora premium HORECA</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// Heurística: los bloques de firma traen líneas con guiones bajos; evitamos que
// se partan entre páginas.
function isSignatureBlock(p: string): boolean {
  return /_{5,}/.test(p);
}
