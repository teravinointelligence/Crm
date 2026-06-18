// Flyer (PDF) de una promoción para enviar a clientes, con el membrete TERAVINO
// y un diseño más vistoso que los PDF internos: banda carmesí a sangre, badge
// grande con la oferta (p. ej. "5 + 1" o "20% OFF") y las condiciones. Genérico:
// se arma desde una promoción del módulo (cualquier tipo).

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const CARMESI = "#A91E3A";
const ORO = "#c9a96e";
const TINTA = "#1F1A1C";
const CREMA = "#FAF7F2";
const MUTED = "#7A6E70";
const BLANCO = "#FFFFFF";

export type PromoFlyerData = {
  title: string;
  product_name: string | null;
  promo_type: string;
  description: string | null;
  discount_pct: number | null;
  bonus_qty: number | null;
  bonus_per: number | null;
  valid_from: string | null;
  valid_to: string | null;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaES(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !day) return d;
  return `${day} ${MESES[m - 1]} ${y}`;
}

const EYEBROW: Record<string, string> = {
  descuento: "Oferta de temporada",
  bonificacion: "Programa de bonificación",
  paquete: "Paquete especial",
  temporada: "Promoción de temporada",
  otro: "Promoción",
};

function oferta(p: PromoFlyerData): { big: string; caption: string } | null {
  if (p.promo_type === "descuento" && p.discount_pct != null) {
    return { big: `${p.discount_pct}%`, caption: "de descuento" };
  }
  if (p.promo_type === "bonificacion" && p.bonus_per && p.bonus_qty) {
    return {
      big: `${p.bonus_per} + ${p.bonus_qty}`,
      caption: `Por cada ${p.bonus_per} botellas, ${p.bonus_qty} de cortesía`,
    };
  }
  return null;
}

const s = StyleSheet.create({
  page: { paddingBottom: 56, fontFamily: "Helvetica", fontSize: 10.5, color: TINTA, backgroundColor: CREMA },
  // Banda superior a sangre
  hero: { backgroundColor: CARMESI, paddingTop: 30, paddingBottom: 22, paddingHorizontal: 48 },
  wordmark: { fontSize: 26, letterSpacing: 6, color: CREMA, fontFamily: "Times-Roman" },
  heroSub: { fontSize: 8.5, letterSpacing: 3, color: ORO, marginTop: 3 },
  heroRule: { height: 2, backgroundColor: ORO, marginTop: 14, width: 70 },

  body: { paddingHorizontal: 48, paddingTop: 26 },
  eyebrow: { fontSize: 9, letterSpacing: 3, color: ORO, textTransform: "uppercase", marginBottom: 6 },
  title: { fontSize: 23, color: CARMESI, fontFamily: "Times-Roman", lineHeight: 1.15, marginBottom: 4 },
  product: { fontSize: 11, color: MUTED, marginBottom: 18 },

  // Badge de oferta
  ofertaWrap: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  ofertaBadge: {
    borderWidth: 2,
    borderColor: ORO,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: "center",
    backgroundColor: BLANCO,
  },
  ofertaBig: { fontSize: 38, color: CARMESI, fontFamily: "Times-Roman", lineHeight: 1 },
  ofertaCaption: { flex: 1, marginLeft: 18, fontSize: 12, color: TINTA, lineHeight: 1.4 },

  descCard: { backgroundColor: BLANCO, borderWidth: 1, borderColor: ORO, borderRadius: 8, padding: 18, marginBottom: 18 },
  descText: { fontSize: 10.5, lineHeight: 1.6, color: TINTA },

  metaRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  metaPill: { backgroundColor: CARMESI, color: CREMA, fontSize: 9.5, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  metaLine: { fontSize: 10, color: MUTED, marginTop: 2 },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: ORO,
    paddingTop: 8,
    fontSize: 8.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function PromoFlyerPdf({ promo }: { promo: PromoFlyerData }) {
  const of = oferta(promo);
  const desde = fechaES(promo.valid_from);
  const hasta = fechaES(promo.valid_to);
  const vigencia =
    desde && hasta ? `${desde} – ${hasta}` : desde ? `Desde ${desde}` : hasta ? `Hasta ${hasta}` : null;

  return (
    <Document title={promo.title}>
      <Page size="LETTER" style={s.page} wrap>
        <View style={s.hero} fixed>
          <Text style={s.wordmark}>TERAVINO</Text>
          <Text style={s.heroSub}>WINE & SPIRITS</Text>
          <View style={s.heroRule} />
        </View>

        <View style={s.body}>
          <Text style={s.eyebrow}>{EYEBROW[promo.promo_type] ?? "Promoción"}</Text>
          <Text style={s.title}>{promo.title}</Text>
          {promo.product_name ? <Text style={s.product}>{promo.product_name}</Text> : <View style={{ height: 6 }} />}

          {of ? (
            <View style={s.ofertaWrap}>
              <View style={s.ofertaBadge}>
                <Text style={s.ofertaBig}>{of.big}</Text>
              </View>
              <Text style={s.ofertaCaption}>{of.caption}</Text>
            </View>
          ) : null}

          {promo.description ? (
            <View style={s.descCard}>
              <Text style={s.descText}>{promo.description}</Text>
            </View>
          ) : null}

          {vigencia ? (
            <>
              <View style={s.metaRow}>
                <Text style={s.metaPill}>Vigencia: {vigencia}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <Text>TERAVINO Wine & Spirits · ventas@teravino.com · 624 178 3189</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
