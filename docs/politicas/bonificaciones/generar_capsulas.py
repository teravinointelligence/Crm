#!/usr/bin/env python3
"""
Generador oficial de Cápsulas Informativas del CRM — TERAVINO.

Produce un PDF de UNA hoja, en la identidad de marca TERAVINO, con N cápsulas
(recomendado 3–5). Cada cápsula tiene a la izquierda la guía para el equipo
(qué es, cuándo usarlo, ruta en el CRM) y a la derecha una "vista del CRM"
recreada fielmente (barra con la URL, título, etiqueta de tipo y botón).

Uso:
    python generar_capsulas.py datos.json salida.pdf
    python generar_capsulas.py            # usa el ejemplo bundled y escribe ./capsulas_crm.pdf

Esquema del JSON de datos (ver references/ejemplo_documentos.json):
{
  "title": "Nuevas herramientas en el CRM",
  "intro_lead": "Formatos oficiales listos para generar.",
  "locator": "CRM  ->  Documentos",          # se muestra como CRM  ->  Documentos
  "header_tag": "EQUIPO DE VENTAS",
  "crm_bar": "crm-steel-tau.vercel.app  ·  Documentos",
  "footer_quote": "Un buen proceso que todos siguen vale 10 veces mas que uno perfecto que nadie sigue.",
  "footer_left": "TERAVINO, S.A. de C.V.   ·   RFC: TER170509L72",
  "footer_right": "Distribucion de vinos y destilados premium",
  "capsules": [
    {
      "title": "Alta de Nuevo Cliente",          # titulo de la capsula (guia)
      "desc":  "Captura los datos ...",           # 1 linea
      "when":  "Al dar de alta una cuenta nueva.",# cuando usarlo
      "path":  "Alta Nuevo Cliente",              # se muestra como Documentos > Alta Nuevo Cliente
      "crm_title": "Alta Nuevo Cliente",          # titulo TAL CUAL aparece en el CRM
      "crm_cat":   "Carta",                       # etiqueta del CRM: Carta / Contrato / ...
      "crm_desc":  "Formato de solicitud ..."     # descripcion del CRM (se trunca a 2 lineas)
    }
  ]
}
Cualquier campo de cabecera/pie es opcional: hay valores por defecto.
"""

import json
import os
import sys

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white

# ----------------------------------------------------------------------------
# Paleta de marca TERAVINO
# ----------------------------------------------------------------------------
CRIMSON   = HexColor("#A91E3A")
GOLD      = HexColor("#C9A96E")
GOLD_RULE = HexColor("#D9BF8A")
INK       = HexColor("#1E1E1E")
INK_MID   = HexColor("#555555")
INK_LIGHT = HexColor("#888888")
RULE      = HexColor("#DEDBD5")
CREAM     = HexColor("#F8F6F2")
# Grises de UI para la vista recreada del CRM
UI_BORDER = HexColor("#E4E2DD")
UI_TITLE  = HexColor("#2B2B2B")
UI_DESC   = HexColor("#8C8C8C")
UI_PILLBG = HexColor("#EFEDEA")
UI_PILLTX = HexColor("#7C7C7C")
UI_BTNBG  = HexColor("#FBFBFA")
UI_BTNBD  = HexColor("#D7D5D0")
UI_BTNTX  = HexColor("#3A3A3A")
UI_BARBG  = HexColor("#F2F0EC")

SERIF, SERIF_B, SERIF_I = "Times-Roman", "Times-Bold", "Times-Italic"
SANS, SANS_B = "Helvetica", "Helvetica-Bold"

W, H = letter
M = 44

DEFAULTS = {
    "title": "Nuevas herramientas en el CRM",
    "intro_lead": "Formatos oficiales listos para generar.",
    "locator": "CRM  ->  Documentos",
    "header_tag": "EQUIPO DE VENTAS",
    "crm_bar": "crm-steel-tau.vercel.app  \u00b7  Documentos",
    "footer_quote": "Un buen proceso que todos siguen vale 10 veces m\u00e1s que uno perfecto que nadie sigue.",
    "footer_left": "TERAVINO, S.A. de C.V.   \u00b7   RFC: TER170509L72",
    "footer_right": "Distribuci\u00f3n de vinos y destilados premium",
}


def _arrows(s):
    # permite escribir -> y > en el JSON sin pelear con flechas unicode
    return s.replace("->", "\u2192").replace(" > ", "  \u203a  ")


def build(data, out_path):
    d = dict(DEFAULTS)
    d.update({k: v for k, v in data.items() if k != "capsules" and v})
    caps = data.get("capsules", [])
    n = len(caps)
    if n == 0:
        raise SystemExit("El JSON no tiene 'capsules'.")
    if n > 6:
        print("AVISO: mas de 6 capsulas no caben comodas en una hoja; considera dividir.")

    c = canvas.Canvas(out_path, pagesize=letter)

    def wrap(text, font, size, max_w):
        words, lines, cur = text.split(), [], ""
        for w in words:
            test = (cur + " " + w).strip()
            if c.stringWidth(test, font, size) <= max_w:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    # ---------------- CABECERA ----------------
    y = H - 56
    c.setFont(SERIF_B, 21)
    c.setFillColor(CRIMSON)
    wm = "T E R A V I N O"
    c.drawString(M, y, wm)
    c.setFillColor(GOLD)
    c.circle(M + c.stringWidth(wm, SERIF_B, 21) + 9, y + 6, 3, stroke=0, fill=1)
    c.setFont(SERIF_B, 8.5)
    c.setFillColor(INK_MID)
    c.drawRightString(W - M, y + 2, d["header_tag"])
    c.setStrokeColor(GOLD_RULE)
    c.setLineWidth(1.6)
    c.line(M, y - 12, W - M, y - 12)

    ty = y - 42
    c.setFont(SERIF_B, 23)
    c.setFillColor(INK)
    c.drawString(M, ty, d["title"])
    lead = d["intro_lead"].rstrip() + " "
    c.setFont(SERIF, 11)
    c.setFillColor(INK_MID)
    c.drawString(M, ty - 18, lead)
    aw = c.stringWidth(lead, SERIF, 11)
    mid = d.get("intro_mid", "Ya est\u00e1n en  ")
    c.drawString(M + aw, ty - 18, mid)
    aw2 = aw + c.stringWidth(mid, SERIF, 11)
    c.setFont(SERIF_B, 11)
    c.setFillColor(CRIMSON)
    c.drawString(M + aw2, ty - 18, _arrows(d["locator"]))

    # ---------------- VISTA RECREADA DEL CRM ----------------
    def crm_preview(x, top, w, h, title, cat, desc, btn=None, bar=None):
        c.setFont(SERIF_I, 8)
        c.setFillColor(INK_LIGHT)
        c.drawString(x + 2, top + 4, "C\u00f3mo se ve en el CRM")
        bottom = top - h
        c.setFillColor(white)
        c.setStrokeColor(UI_BORDER)
        c.setLineWidth(1)
        c.roundRect(x, bottom, w, h, 9, stroke=1, fill=1)
        bar_h = 16
        c.setFillColor(UI_BARBG)
        c.roundRect(x, top - bar_h, w, bar_h, 9, stroke=0, fill=1)
        c.setFillColor(white)
        c.rect(x, top - bar_h, w, bar_h - 9, stroke=0, fill=1)
        for i, col in enumerate([HexColor("#E0857F"), HexColor("#E3C07A"), HexColor("#9FC79B")]):
            c.setFillColor(col)
            c.circle(x + 10 + i * 9, top - bar_h / 2, 2.4, stroke=0, fill=1)
        c.setFont(SANS, 6.6)
        c.setFillColor(UI_PILLTX)
        c.drawString(x + 40, top - bar_h + 5.2, bar or d["crm_bar"])
        c.setStrokeColor(UI_BORDER)
        c.setLineWidth(0.6)
        c.line(x, top - bar_h, x + w, top - bar_h)

        pad = 12
        ix = x + pad
        cy = top - bar_h - 16
        c.setFont(SANS, 6.6)
        pw = c.stringWidth(cat, SANS, 6.6) + 12
        px = x + w - pad - pw
        c.setFillColor(UI_PILLBG)
        c.roundRect(px, cy - 3, pw, 13, 6.5, stroke=0, fill=1)
        c.setFillColor(UI_PILLTX)
        c.drawCentredString(px + pw / 2, cy + 0.5, cat)
        ts = 10.5
        maxt = px - ix - 8
        while c.stringWidth(title, SANS_B, ts) > maxt and ts > 8:
            ts -= 0.5
        c.setFont(SANS_B, ts)
        c.setFillColor(UI_TITLE)
        c.drawString(ix, cy, title)
        dy = cy - 14
        c.setFont(SANS, 7.8)
        c.setFillColor(UI_DESC)
        for ln in wrap(desc, SANS, 7.8, w - 2 * pad)[:2]:
            c.drawString(ix, dy, ln)
            dy -= 9.6
        btn_label = btn or "Generar con esta"
        btn_w = max(92, c.stringWidth(btn_label, SANS_B, 8) + 22)
        btn_h = 17
        by = bottom + 11
        c.setFillColor(UI_BTNBG)
        c.setStrokeColor(UI_BTNBD)
        c.setLineWidth(1)
        c.roundRect(ix, by, btn_w, btn_h, 5, stroke=1, fill=1)
        c.setFont(SANS_B, 8)
        c.setFillColor(UI_BTNTX)
        c.drawCentredString(ix + btn_w / 2, by + 5, btn_label)

    # ---------------- TEXTO DE LA CÁPSULA (izquierda) ----------------
    def capsule_text(x, top, w, num, title, desc, when, path, path_full=None):
        bx, by = x + 11, top - 7
        c.setFillColor(CRIMSON)
        c.circle(bx, by, 11, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont(SERIF_B, 12)
        c.drawCentredString(bx, by - 4, str(num))
        c.setFillColor(INK)
        c.setFont(SERIF_B, 13.5)
        c.drawString(x + 28, top - 11, title)
        dy = top - 30
        c.setFont(SERIF, 9.6)
        c.setFillColor(INK_MID)
        for ln in wrap(desc, SERIF, 9.6, w):
            c.drawString(x, dy, ln)
            dy -= 12
        dy -= 3
        c.setFont(SERIF_B, 8.4)
        c.setFillColor(CRIMSON)
        c.drawString(x, dy, "CU\u00c1NDO")
        cw = c.stringWidth("CU\u00c1NDO   ", SERIF_B, 8.4)
        c.setFont(SERIF, 9.2)
        c.setFillColor(INK)
        wl = wrap(when, SERIF, 9.2, w - cw)
        if wl:
            c.drawString(x + cw, dy, wl[0])
            for extra in wl[1:]:
                dy -= 11
                c.drawString(x, dy, extra)
        dy -= 14
        c.setFont(SERIF_B, 8.8)
        c.setFillColor(CRIMSON)
        c.drawString(x, dy, _arrows(path_full) if path_full else "Documentos  \u203a  " + path)

    # ---------------- LAYOUT DE FILAS ----------------
    Lw = 248
    gapx = 16
    Rx = M + Lw + gapx
    Rw = W - M - Rx

    grid_top = ty - 36
    fy = 104  # posicion de la regla del pie
    gap = 8
    avail = grid_top - (fy + 14)
    row_h = min(118, (avail - (n - 1) * gap) / n)
    prev_h = max(70, min(row_h - 26, 96))

    for i, r in enumerate(caps):
        rtop = grid_top - i * (row_h + gap)
        capsule_text(M, rtop, Lw, i + 1,
                     r.get("title", ""), r.get("desc", ""),
                     r.get("when", ""), r.get("path", ""), r.get("path_full"))
        crm_preview(Rx, rtop - 6, Rw, prev_h,
                    r.get("crm_title", r.get("title", "")),
                    r.get("crm_cat", ""), r.get("crm_desc", ""),
                    r.get("crm_btn"), r.get("crm_bar"))
        if i < n - 1:
            c.setStrokeColor(RULE)
            c.setLineWidth(0.5)
            c.line(M, rtop - row_h + 2, W - M, rtop - row_h + 2)

    # ---------------- NOTA DESTACADA (opcional) ----------------
    if d.get("note"):
        nb_h = 56
        nb_y = fy + 18
        c.setFillColor(CREAM)
        c.roundRect(M, nb_y, W - 2 * M, nb_h, 6, stroke=0, fill=1)
        c.setFillColor(CRIMSON)
        c.rect(M, nb_y, 4, nb_h, stroke=0, fill=1)
        nx = M + 18
        c.setFont(SERIF_B, 9)
        c.setFillColor(CRIMSON)
        c.drawString(nx, nb_y + nb_h - 18, d.get("note_title", "VIGENCIA"))
        c.setFont(SERIF, 9.4)
        c.setFillColor(INK)
        ndy = nb_y + nb_h - 32
        for ln in wrap(d["note"], SERIF, 9.4, W - 2 * M - 36)[:3]:
            c.drawString(nx, ndy, ln)
            ndy -= 11.5

    # ---------------- PIE ----------------
    c.setStrokeColor(GOLD_RULE)
    c.setLineWidth(1.2)
    c.line(M, fy, W - M, fy)
    c.setFont(SERIF_I, 10.5)
    c.setFillColor(INK_MID)
    c.drawCentredString(W / 2, fy - 16, d["footer_quote"])
    c.setFont(SERIF, 8)
    c.setFillColor(INK_LIGHT)
    c.drawString(M, fy - 32, d["footer_left"])
    c.drawRightString(W - M, fy - 32, d["footer_right"])

    c.showPage()
    c.save()
    print("PDF generado:", out_path)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    if len(sys.argv) >= 2:
        data_path = sys.argv[1]
        out_path = sys.argv[2] if len(sys.argv) >= 3 else "capsulas_crm.pdf"
    else:
        data_path = os.path.join(here, "..", "references", "ejemplo_documentos.json")
        out_path = "capsulas_crm.pdf"
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    build(data, out_path)


if __name__ == "__main__":
    main()
