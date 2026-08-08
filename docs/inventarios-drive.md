# Inventarios desde Google Drive (`/api/cron/inventarios-drive`)

Cron diario que lee los cortes de inventario que el equipo sube a Google Drive
y actualiza `product_warehouse_stock`. Elimina el paso de volver a cargar a
mano el mismo Excel en Catálogo.

- Lógica pura (detección de almacén, selección de archivo): `lib/inventario-drive.ts`
- Acceso a Drive (cuenta de servicio, sin dependencias nuevas): `lib/google-drive.ts`
- Orquestación (descarga, parseo, escritura, bitácora): `lib/inventario-drive-sync.ts`
- Ruta del cron: `app/api/cron/inventarios-drive/route.ts`
- Pruebas: `tests/inventario-drive.test.mjs`

## Cómo funciona

1. Lista los archivos de la carpeta de Drive (`GOOGLE_DRIVE_INVENTARIOS_FOLDER_ID`).
2. Filtra a los que son cortes de inventario reales: nombre con "inventario",
   extensión `.xls`/`.xlsx`, sin temporales `~$`, sin traspasos ni reportes de ventas.
3. Deduce el almacén del nombre del archivo y se queda con el **corte más
   reciente de cada almacén**. La carpeta acumula meses de archivos.
4. Si ese archivo exacto (mismo id de Drive, misma fecha de modificación) ya se
   importó con éxito, lo salta.
5. Descarga, parsea con el mismo `parseStockExcel` del importador manual,
   empareja códigos contra `products.sku` o `products.codigo_contpaqi`, y hace
   upsert en `product_warehouse_stock`.
6. El trigger de la migración 0081 recalcula solo `products.stock_quantity`
   como la suma de los almacenes.
7. Deja renglón en `inventory_imports` con `import_type = 'inventario_almacen'`
   y el origen (`source_file_id`, `source_modified_at` — migración 0098).

## Horario

`0 15 * * 1,3,5` — **lunes, miércoles y viernes**, en la hora de las **8am de
La Paz** (15:00 UTC; BCS es UTC-7 todo el año).

El flujo que asume: Sabrina se levanta a las 6, baja los cortes de CONTPAQi y
los sube a Drive alrededor de las 7:30. El cron entra después.

> **Por qué las 8 y no las 7:30.** En el plan Hobby de Vercel el **campo de los
> minutos no se respeta**: un cron se dispara en cualquier momento *dentro de la
> hora* indicada (±59 min). Con `30 14 * * …` (7:30am) el disparo real caería
> entre las 7:00 y las 7:59 — podría entrar *antes* de que los archivos estén en
> Drive y perder el corte hasta la siguiente corrida, dos días después. La hora
> de las 8 (15:00 UTC → 8:00–8:59am) garantiza que siempre corre después de la
> subida.
>
> Un horario exacto a las 7:30 requiere plan Pro ($20/usuario/mes). No vale la
> pena solo por esto: si un día se sube tarde, el corte simplemente entra en la
> siguiente corrida.

Si el archivo del día no está listo, el cron no rompe nada: encuentra el corte
anterior, lo detecta como ya importado y responde `sin cambios`.

## Nombres de archivo

El almacén sale del nombre. Alias reconocidos (por palabra completa, nunca
subcadena suelta, así que "cab" no empata dentro de "cabaña"):

| Almacén | Alias |
|---|---|
| La Paz | `la paz`, `lapaz`, `lap`, `paz`, `bodega lap` |
| V612 | `v612`, `tienda v612` |
| Tijuana | `tijuana`, `tij` |
| Vallarta | `vallarta`, `vta`, `pv`, `puerto vallarta` |
| Los Cabos | `los cabos`, `loscabos`, `cabos`, `cab`, `sjd` |

Si un nombre menciona **dos** almacenes (p. ej. `Traspaso_Vallarta_Tijuana`),
el archivo se omite a propósito y se reporta en `skipped`: adivinar ahí
escribiría existencias en el almacén equivocado, y un inventario mal cargado es
peor que uno no cargado.

> **Recomendación**: usar un formato fijo, `inventario-<almacen>-<YYYY-MM-DD>.xls`.
> Los nombres actuales son inconsistentes (`inventario bodega lap 5 ago` vs
> `inventario almacen v612 6 agosto`) y cada variante nueva es un riesgo.

## Configuración

Cuatro variables en **Vercel → Settings → Environment Variables**:

| Variable | Qué es |
|---|---|
| `CRON_SECRET` | Secreto del cron. **Obligatorio**: sin él la ruta responde 503. |
| `GOOGLE_SA_EMAIL` | Correo de la cuenta de servicio de Google |
| `GOOGLE_SA_PRIVATE_KEY` | `private_key` del JSON de la cuenta de servicio |
| `GOOGLE_DRIVE_INVENTARIOS_FOLDER_ID` | Id de la carpeta de Drive |

### Crear la cuenta de servicio

1. [Google Cloud Console](https://console.cloud.google.com) → crear (o elegir)
   un proyecto.
2. **APIs & Services → Library** → habilitar **Google Drive API**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   Nombre sugerido: `teravino-crm-drive`. No necesita ningún rol de IAM.
4. En la cuenta creada → **Keys → Add key → Create new key → JSON**. Se descarga
   un archivo.
5. Del JSON, copiar `client_email` a `GOOGLE_SA_EMAIL` y `private_key` a
   `GOOGLE_SA_PRIVATE_KEY` (se pega tal cual, con los `\n` escapados).
6. En Drive, **compartir la carpeta de inventarios** con ese `client_email` como
   **Lector**. Sin este paso el cron no ve nada aunque las llaves sean correctas.
7. El id de la carpeta sale de su URL:
   `drive.google.com/drive/folders/`**`<ESTE_ES_EL_ID>`**.

La cuenta de servicio solo pide alcance `drive.readonly`: puede leer lo que se
le comparta explícitamente y nada más.

### Probar a mano

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-deploy>/api/cron/inventarios-drive
```

Responde con el resumen por almacén (`actualizado` / `sin cambios` / `error`),
cuántas filas entraron y qué archivos se omitieron y por qué.

## Seguridad

A diferencia de los otros crons —que solo mandan correos y se auto-protegen
*si* hay `CRON_SECRET`— este **escribe existencias**, así que exige el secreto
siempre. Sin `CRON_SECRET` responde 503 en vez de quedar abierto: el repo es
público y la ruta sería un endpoint de escritura sin autenticar.

## Lo que NO hace

- No da de alta productos que no existan en el catálogo. Los códigos sin
  empatar se cuentan y quedan en `error_log`, pero no crean producto.
- No borra existencias de productos ausentes del archivo. El export de CONTPAQi
  incluye todos los productos (con 0 cuando aplica), así que en la práctica el
  corte es completo; es el mismo comportamiento del importador manual.
- No guarda histórico. `product_warehouse_stock` es estado actual y se
  sobrescribe; `inventory_imports` guarda la bitácora de cada corrida.
