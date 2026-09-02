# Regenerar el dataset de añadas (RP Wine Advocate Vintage Chart)

`lib/vintage-chart/data.ts` es un subconjunto ACOTADO del Vintage Chart de
Robert Parker Wine Advocate (sólo las regiones que aparecen en el catálogo de
Teravino, añadas 2000–2025). Se usa para anotar la ficha de cada vino con la
calidad de su añada en la región, con atribución a RP — nunca como tabla
navegable ni redistribución del chart completo.

## Cuándo regenerar
Cuando Sabrina baje (bajo su propia suscripción) un `VintageChart_print.pdf`
actualizado, o cuando el catálogo incorpore regiones nuevas.

## Pasos
1. `pip install pdfplumber`
2. `python3 extract.py`  → genera `vc_all.json` (las 57 regiones, 2000–2025)
   - Ajusta la ruta del PDF dentro de `extract.py` si hace falta.
3. Edita `gen_data.py`:
   - En `M` (y en el bloque de Toscana) define qué regiones del chart mapear a
     qué claves — sólo las que el catálogo realmente toca.
4. `python3 gen_data.py`  → escribe `../../lib/vintage-chart/data.ts`
5. Si agregas regiones nuevas, añade sus reglas de mapeo en
   `lib/vintage-chart/resolve.ts` (`matchRegionKey`) y valida con datos reales.

La extracción es por posición de columna (no por orden de texto), así que los
rangos ("92-95T") y las celdas en blanco quedan alineados con su añada correcta.
