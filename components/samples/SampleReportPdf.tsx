// PDF del reporte de muestras por vendedor. Lo arma la ruta
// /api/muestras/reporte/pdf con los MISMOS datos y filtros de la pantalla
// (ver lib/muestras-reporte.ts), en horizontal para que quepa el detalle.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { RepAgg, SampleReportRow } from "@/lib/muestras-reporte";

const CARMESI = "#A91E3A";
const ORO = "#c9a96e";
const TINTA = "#1F1A1C";
const CREMA = "#FAF7F2";
const MUTED = "#7A6E70";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9, color: TINTA, backgroundColor: CREMA },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: CARMESI, paddingBottom: 10, marginBottom: 14 },
  wordmark: { fontSize: 20, letterSpacing: 5, color: CARMESI, fontFamily: "Times-Roman" },
  small: { fontSize: 8, color: MUTED },
  h1: { fontSize: 15, color: CARMESI, fontFamily: "Times-Roman" },
  h2: { fontSize: 10, color: CARMESI, textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap" },
  metaItem: { width: "25%", marginBottom: 6 },
  metaLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 10 },
  th: { fontSize: 7.5, color: CARMESI, textTransform: "uppercase", letterSpacing: 1 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARMESI, paddingBottom: 5, marginBottom: 4 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#E8DDC8" },
  totalRow: { flexDirection: "row", paddingVertical: 5, borderTopWidth: 1, borderTopColor: CARMESI, marginTop: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  note: { fontSize: 7.5, color: MUTED, marginTop: 6 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

// Anchos de columna: el resumen por vendedor y el detalle son tablas distintas.
const v = StyleSheet.create({
  nombre: { flex: 3 },
  num: { flex: 1.2, textAlign: "right" },
  valor: { flex: 1.8, textAlign: "right" },
});
const d = StyleSheet.create({
  folio: { flex: 1.7 },
  fecha: { flex: 1.5 },
  vendedor: { flex: 1.8 },
  cliente: { flex: 3 },
  motivo: { flex: 3.4 },
  botellas: { flex: 1, textAlign: "right" },
  valor: { flex: 1.6, textAlign: "right" },
  estatus: { flex: 1.4 },
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n);
const fecha = (x: string | null) =>
  x ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mazatlan" }).format(new Date(x)) : "—";
// Las fechas del rango son "puras" (YYYY-MM-DD): mediodía para no correr el día.
const fechaDia = (x: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(`${x}T12:00:00`));

export type SampleReportPdfData = {
  desde: string;
  hasta: string;
  generadoISO: string;
  filtroVendedor: string;
  filtroEstatus: string;
  porVendedor: RepAgg[];
  totales: { solicitudes: number; botellas: number; valor: number; sinPrecio: number };
  detalle: SampleReportRow[];
};

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaItem}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

export function SampleReportPdf({ data }: { data: SampleReportPdfData }) {
  const { desde, hasta, generadoISO, filtroVendedor, filtroEstatus, porVendedor, totales, detalle } = data;

  return (
    <Document title={`Muestras por vendedor ${desde} a ${hasta}`}>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.wordmark}>TERAVINO</Text>
            <Text style={s.small}>TERAVINO, S.A. de C.V. · RFC: TER170509L72</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>Muestras por vendedor</Text>
            <Text style={s.small}>Del {fechaDia(desde)} al {fechaDia(hasta)}</Text>
          </View>
        </View>

        <View style={s.metaGrid}>
          <Meta label="Vendedor" value={filtroVendedor} />
          <Meta label="Estatus" value={filtroEstatus} />
          <Meta label="Solicitudes" value={String(totales.solicitudes)} />
          <Meta label="Botellas" value={String(totales.botellas)} />
        </View>

        <Text style={s.h2}>Por vendedor</Text>
        <View style={s.tableHeader}>
          <Text style={[s.th, v.nombre]}>Vendedor</Text>
          <Text style={[s.th, v.num]}>Solicitudes</Text>
          <Text style={[s.th, v.num]}>Botellas</Text>
          <Text style={[s.th, v.num]}>Clientes</Text>
          <Text style={[s.th, v.num]}>Capacitaciones</Text>
          <Text style={[s.th, v.valor]}>Valor (precio lista)</Text>
        </View>
        {porVendedor.map((r) => (
          <View key={r.repId} style={s.row} wrap={false}>
            <Text style={v.nombre}>{r.vendedor}</Text>
            <Text style={v.num}>{r.solicitudes}</Text>
            <Text style={v.num}>{r.botellas}</Text>
            <Text style={v.num}>{r.clientes}</Text>
            <Text style={v.num}>{r.capacitaciones}</Text>
            <Text style={v.valor}>{mxn(r.valor)}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[v.nombre, s.bold]}>TOTAL</Text>
          <Text style={[v.num, s.bold]}>{totales.solicitudes}</Text>
          <Text style={[v.num, s.bold]}>{totales.botellas}</Text>
          <Text style={v.num}>—</Text>
          <Text style={v.num}>—</Text>
          <Text style={[v.valor, s.bold]}>{mxn(totales.valor)}</Text>
        </View>
        {totales.sinPrecio > 0 && (
          <Text style={s.note}>
            +{totales.sinPrecio} botellas de renglones sin producto del catálogo, sin precio de lista.
          </Text>
        )}

        <Text style={s.h2}>Detalle de solicitudes</Text>
        <View style={s.tableHeader}>
          <Text style={[s.th, d.folio]}>Folio</Text>
          <Text style={[s.th, d.fecha]}>Fecha</Text>
          <Text style={[s.th, d.vendedor]}>Vendedor</Text>
          <Text style={[s.th, d.cliente]}>Cliente</Text>
          <Text style={[s.th, d.motivo]}>Motivo</Text>
          <Text style={[s.th, d.botellas]}>Botellas</Text>
          <Text style={[s.th, d.valor]}>Valor</Text>
          <Text style={[s.th, d.estatus]}>Estatus</Text>
        </View>
        {detalle.map((r) => (
          <View key={r.id} style={s.row} wrap={false}>
            <Text style={d.folio}>{r.folio}</Text>
            <Text style={d.fecha}>{fecha(r.fecha)}</Text>
            <Text style={d.vendedor}>{r.vendedor}</Text>
            <Text style={d.cliente}>
              {r.cliente ?? "—"}
              {r.capacitacionPersonas != null ? ` (capacitación ${r.capacitacionPersonas}p)` : ""}
            </Text>
            <Text style={d.motivo}>{r.motivo ?? "—"}</Text>
            <Text style={d.botellas}>{r.botellas}</Text>
            <Text style={d.valor}>{mxn(r.valor)}</Text>
            <Text style={d.estatus}>{r.estatus}</Text>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>TERAVINO — Reporte generado el {fecha(generadoISO)}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
