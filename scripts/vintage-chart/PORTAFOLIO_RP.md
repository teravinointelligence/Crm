# "RP 97" en los portafolios PDF de marca

Los portafolios PDF por zona **no los genera el CRM**: los produce la skill
`portafolio-teravino` desde el Excel maestro de Los Cabos. Por eso el badge de
añada de Robert Parker va en esa generación, no en el código de la app.

## Qué es `rp_anadas.py`
`scripts/vintage-chart/rp_anadas.py` es un puerto **autónomo** (sin dependencias)
del resolver del CRM (`lib/vintage-chart/`). Mismo dataset acotado (34 regiones,
añadas 2000–2025) y misma lógica de mapeo. Es la copia canónica y
versionada; hay otra copia junto a la skill (`…/skills/portafolio-teravino/scripts/rp_anadas.py`).

```python
from rp_anadas import rp_badge, rp_lookup
rp_badge("Pauillac", "Château Lynch Bages", "2016")   # -> "RP 97"
rp_badge("California", "Bogle Chardonnay", "2023")     # -> None (omitido a propósito)
rp_lookup("Rioja DOCa", "Gómez Cruzado Honorable", "2021")
#   -> {"badge":"RP 95","band":"Excepcional","region_label":"Rioja",
#       "rp_name":"Rioja","year":2021,"maturity":"T", ...}
```

## Cómo se aplica al regenerar
En `scripts/generate_portafolio.py` de la skill, al dibujar cada renglón de vino,
llama `rp_badge(region_origin, nombre_vino, anada)` (columnas Región / Añada del
Excel) y pinta el resultado junto al nombre. Si es `None`, no se pinta nada.

- Formato `RP 97` (o rango `RP 92-95` en añadas de barrica). Discreto, sin romper
  el diseño oficial.
- Nota al pie: "Calificaciones de añada: Robert Parker Wine Advocate Vintage Chart
  (suscripción Teravino)".
- Solo mapean vinos de regiones que cubre el chart. Se omiten a propósito
  "California" genérico, "South of France", Toscana sin denominación, México,
  Piedmont no-Barolo. La cepa se detecta del NOMBRE (varietal viene vacío).

## Mantener sincronizado con el CRM
Si cambias la lógica en `lib/vintage-chart/resolve.ts` o el dataset
`lib/vintage-chart/data.ts`, re-exporta `rp_anadas.py` (ver README de esta
carpeta) para que la skill y el CRM den la misma calificación.
