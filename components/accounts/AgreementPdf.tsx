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
  title: { fontSize: 14, fontFamily: "Times-Roman", marginBottom: 4 },
  body: { fontSize: 10, lineHeight: 1.4, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  field: { width: "50%", marginBottom: 8 },
  th: { fontSize: 8, color: CARMESI, textTransform: "uppercase", letterSpacing: 1 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARMESI, paddingBottom: 5, marginBottom: 5 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#E8DDC8" },
  cKind: { flex: 1.4 }, cDesc: { flex: 2.4 }, cSerial: { flex: 1.6 }, cQty: { flex: 0.8, textAlign: "right" }, cStat: { flex: 1, textAlign: "right" },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderColor: ORO, color: CARMESI, fontSize: 8, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 56 },
  signBox: { width: "44%", borderTopWidth: 1, borderTopColor: TINTA, paddingTop: 6, alignItems: "center" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: ORO, paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

const fmt = (x: string | null) =>
  x ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(x + "T00:00:00")) : "—";

const TYPE_LABELS: Record<string, string> = {
  comodato: "Comodato",
  precio_especial: "Precio especial",
  consignacion: "Consignación",
  exclusividad: "Exclusividad",
  volumen: "Volumen",
  otro: "Otro",
};
const STATUS_LABELS: Record<string, string> = {
  vigente: "Vigente",
  vencido: "Vencido",
  cancelado: "Cancelado",
};
const KIND_LABELS: Record<string, string> = {
  cava: "Cava",
  coravin: "Equipo Coravin",
  enfriador: "Enfriador",
  mueble: "Mueble / exhibidor",
  otro: "Otro",
};

export type AgreementPdfData = {
  account: { business_name: string; fiscal_name: string | null; rfc: string | null; region: string | null };
  generatedAt: string;
  agreement: {
    agreement_date: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    price_notes: string | null;
    discount_pct: number | null;
    credit_days: number | null;
    valid_from: string | null;
    valid_until: string | null;
  };
  contactName: string | null;
  repName: string | null;
  equipment: Array<{ kind: string; description: string; quantity: number; serial: string | null; status: string }>;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

export function AgreementPdf({ data }: { data: AgreementPdfData }) {
  const { account, agreement, equipment, contactName, repName } = data;
  const hasConditions =
    agreement.price_notes ||
    agreement.discount_pct != null ||
    agreement.credit_days != null ||
    agreement.valid_from ||
    agreement.valid_until;
  return (
    <Document title={`Acuerdo ${account.business_name} — ${agreement.title}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.wordmark}>TERAVINO</Text>
            <Text style={s.small}>TERAVINO, S.A. de C.V. · RFC: TER170509L72</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>Acuerdo comercial</Text>
            <Text style={s.small}>Generado {fmt(data.generatedAt.slice(0, 10))}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={s.metaLabel}>Cliente</Text>
          <Text style={s.metaValue}>{account.business_name}</Text>
          {account.fiscal_name ? <Text style={s.small}>{account.fiscal_name}</Text> : null}
          {account.rfc ? <Text style={s.small}>RFC: {account.rfc}</Text> : null}
          {account.region ? <Text style={s.small}>{account.region}</Text> : null}
        </View>

        <Text style={s.h2}>Acuerdo</Text>
        <Text style={s.title}>{agreement.title}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
          <Text style={s.badge}>{TYPE_LABELS[agreement.type] ?? agreement.type}</Text>
          <Text style={s.badge}>{STATUS_LABELS[agreement.status] ?? agreement.status}</Text>
        </View>
        {agreement.description ? <Text style={s.body}>{agreement.description}</Text> : null}

        <View style={s.grid}>
          <Field label="Fecha del acuerdo" value={fmt(agreement.agreement_date)} />
          <Field label="Pactado con" value={contactName ?? "—"} />
          <Field label="Vendedor Teravino" value={repName ?? "—"} />
        </View>

        {hasConditions ? (
          <>
            <Text style={s.h2}>Condiciones comerciales</Text>
            <View style={s.grid}>
              {agreement.discount_pct != null ? (
                <Field label="Descuento" value={`${agreement.discount_pct}%`} />
              ) : null}
              {agreement.credit_days != null ? (
                <Field label="Días de crédito" value={agreement.credit_days === 0 ? "Contado" : `${agreement.credit_days} días`} />
              ) : null}
              {agreement.valid_from ? <Field label="Vigente desde" value={fmt(agreement.valid_from)} /> : null}
              {agreement.valid_until ? <Field label="Vigente hasta" value={fmt(agreement.valid_until)} /> : null}
            </View>
            {agreement.price_notes ? (
              <>
                <Text style={s.metaLabel}>Precios / condiciones</Text>
                <Text style={s.body}>{agreement.price_notes}</Text>
              </>
            ) : null}
          </>
        ) : null}

        {equipment.length > 0 && (
          <>
            <Text style={s.h2}>Equipo a comodato</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, s.cKind]}>Tipo</Text>
              <Text style={[s.th, s.cDesc]}>Descripción</Text>
              <Text style={[s.th, s.cSerial]}>No. de serie</Text>
              <Text style={[s.th, s.cQty]}>Cant.</Text>
              <Text style={[s.th, s.cStat]}>Estatus</Text>
            </View>
            {equipment.map((e, idx) => (
              <View key={idx} style={s.row} wrap={false}>
                <Text style={s.cKind}>{KIND_LABELS[e.kind] ?? e.kind}</Text>
                <Text style={s.cDesc}>{e.description}</Text>
                <Text style={s.cSerial}>{e.serial ?? "—"}</Text>
                <Text style={s.cQty}>{e.quantity}</Text>
                <Text style={s.cStat}>{e.status === "devuelto" ? "Devuelto" : "Prestado"}</Text>
              </View>
            ))}
            <Text style={[s.small, { marginTop: 8 }]}>
              El equipo descrito es propiedad de TERAVINO, S.A. de C.V. y se entrega en comodato. El
              cliente se obliga a conservarlo en buen estado y a devolverlo al término del acuerdo.
            </Text>
          </>
        )}

        <View style={s.signRow} wrap={false}>
          <View style={s.signBox}>
            <Text>{account.business_name}</Text>
            <Text style={s.small}>{contactName ?? "Cliente"}</Text>
          </View>
          <View style={s.signBox}>
            <Text>TERAVINO, S.A. de C.V.</Text>
            <Text style={s.small}>{repName ?? "Representante"}</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>TERAVINO — Distribuidora premium HORECA</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
