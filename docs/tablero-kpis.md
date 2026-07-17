# Tablero de KPIs (`/tablero`)

Tablero en 3 niveles — **Dirección**, **Vendedor** (el foco) y **Región** — con
selector de periodo (Mes actual / Últimos 3 / Últimos 6 / Año actual) y de
región. No inventa cálculos: reutiliza las mismas fuentes que los módulos
existentes.

- Cálculos: `lib/kpis/data.ts` (server-only)
- Definiciones/fórmulas por KPI: `lib/kpis/definitions.ts`
- Metas y umbrales de semáforo: `config/kpi-targets.ts` (por ahora en código;
  el plan es moverlas a una tabla `kpi_targets` editable desde la app)
- Rango de periodo compartido con /reportes: `lib/kpis/period.ts`

**Acceso**: mismo gate que Reportes (`canViewReportes`). Admin y contador ven
los 3 niveles; un vendedor (`rep`) solo su propia tarjeta (además la RLS acota
sus datos server-side).

**Mes de referencia**: la venta viene de la importación mensual CONTPAQ
(`monthly_sales`), así que "este mes" se ancla al **último mes cargado** dentro
del periodo. Evita marcar caídas falsas cuando el mes corriente aún no se
importa; el encabezado siempre muestra qué mes es.

**Semáforos**: cada KPI con meta pinta verde/ámbar/rojo según
`semaforoKpi(valor, meta)` — para KPIs "más es mejor" (venta, cobertura), verde
al cumplir la meta y ámbar desde el 80% (configurable); para "menos es mejor"
(% vencido, DSO), verde bajo la meta y ámbar hasta 1.5× (configurable). La
variación ↑/↓ compara contra el periodo espejo inmediatamente anterior del
mismo largo (o mes vs mes donde se indica MoM).

**Cadencia**: los KPIs de **cobranza** (% vencido, DSO, monto vencido,
suspendidas) y de **actividad del equipo** (actividades, citas, siguientes
vencidos, cobertura, inactivas, sin pedido, prospectos sin gestión, quiebres de
stock) son de seguimiento **SEMANAL** y llevan su etiqueta en la UI. El resto
(venta, mix, ticket, penetración, pipeline) es **MENSUAL**.

---

## Nivel 1 — Dirección

| KPI | Fórmula | Fuente | Cadencia |
| --- | --- | --- | --- |
| Venta bruta | Σ `venta_bruta` del periodo (mismos números que /ventas y /reportes); subtítulo: base comisión (Σ `neto_desc`) | `monthly_sales` | Mensual |
| Crecimiento MoM | (venta del último mes cargado − mes anterior) / mes anterior × 100 | `monthly_sales` (tendencia 12m) | Mensual |
| Ticket promedio | Venta bruta / cuentas con compra del periodo | `monthly_sales` | Mensual |
| Cuentas con compra | Cuentas distintas con venta en el periodo, junto al total de cuentas `activo` | `monthly_sales` + `accounts` | Mensual |
| **% cartera vencida** | Saldo vencido / saldo pendiente × 100 (KPI crítico) | `v_account_balance` (misma vista que /cartera; excluye socios del vencido) | **Semanal** |
| **DSO** | Saldo pendiente / venta del periodo × días del periodo (aprox. 30 × meses) | `v_account_balance` + `monthly_sales` | **Semanal** |
| Cuentas en caída | Cuentas cuyo último mes quedó en $0 ("dejó de facturar") o ≥50% abajo de su propio promedio de 3 meses | `monthly_sales` vía `computeChurn` (lib/churn.ts — mismo motor que el Dashboard) | Mensual |
| Cuentas reactivadas | Con venta en el último mes cargado, $0 el mes anterior y con historial previo | `monthly_sales` | Mensual |
| **Productos en riesgo** | Modelo de reorden de /restock/sugerencias (`getAtRiskProductIds`) | `lib/restock-data.ts` | **Semanal** |
| Mix de producto | % de la venta por familia Vino / Cerveza / Espumosos / Otros, cruzando `monthly_sales_items.codigo` con `products.sku` / `codigo_contpaqi` → `category` | `monthly_sales_items` × `products` | Mensual |
| Pipeline vs cerrado | Cotizaciones abiertas ($, borrador/enviada) vs pedidos cerrados del periodo; conversión = cerrado / (cerrado + pipeline). OJO: `orders` son cotizaciones del CRM, no facturación real | `orders` | Mensual |

## Nivel 2 — Vendedor (foco: disciplina y cobertura)

Una tarjeta por vendedor activo con cartera (roles vendedor/admin de
`sales_reps` — hoy: Yamile, Andra, Citlali, Sabrina, Felix, Emmanuel…).

**Bloque Ventas** (mensual): venta bruta y base comisión del periodo, % del
total del equipo, variación MoM (mes de referencia vs anterior), cuentas con
compra y ticket promedio. Fuente: `monthly_sales`.

**Bloque Actividad** (semanal), fuente `activities` + `sales_reps`:

- Actividades del periodo desglosadas por tipo (visita, llamada, degustación,
  email, WhatsApp, reunión, evento).
- Citas: realizadas / (realizadas + agendadas cuya fecha ya pasó) — las citas
  futuras no castigan la tasa.
- **Siguientes vencidos** (en rojo): actividades con próximo paso sin completar
  (`next_step_done = false`) y `next_step_date` ya pasada.
- Última conexión (`last_seen_at`, mismo dato que "Actividad del equipo").
- **Cobertura**: % de sus cuentas activas con ≥1 actividad en los últimos 30
  días.

**Bloque Cuentas en riesgo** (semanal — lo más importante):

- **Inactivas 30+ días**: sus cuentas activas sin actividad (o sin actividad
  alguna), lista clickable a la ficha. Fuente `v_account_last_activity` (misma
  vista que "Visitar pronto").
- **Sin pedido este mes**: compraron el mes anterior (al último cargado) y no
  aparecen en el mes de referencia, con lo que facturaban en promedio (últimos
  3 meses con venta). Fuente `monthly_sales`.
- **Vencidas / suspendidas**: cuentas suyas con saldo vencido y cuántas caen en
  "Suspendido" según la política de /cartera (45+ días vía `semaforoCobranza`),
  más el monto vencido total. Fuente `v_account_balance`.
- **Prospectos sin gestión**: sus cuentas `prospecto` sin ninguna actividad.

**Pendientes de la semana**: lista accionable que combina siguientes vencidos +
sin pedido + inactivas, ordenada por severidad (vencidos → sin pedido →
inactivas) y por valor (saldo vencido o venta promedio), con botón **Registrar
actividad** que abre `/actividades/nueva?account=<id>` (mismo flujo del
Dashboard). Máximo 8 filas.

## Nivel 3 — Región

Una fila por región (Los Cabos, Todos Santos, La Paz, Tijuana, Puerto Vallarta,
Nayarit, Sin región — orden canónico; se agregan las que existan en Cuentas):

| Columna | Fórmula | Fuente |
| --- | --- | --- |
| Venta bruta / % del total / MoM | Σ venta del periodo por región de la cuenta; MoM = mes de referencia vs anterior | `monthly_sales` × `accounts.region` |
| Cuentas activas y penetración | Con compra / activas × 100 | `accounts` + `monthly_sales` |
| Monto vencido y % vencido | Σ saldo vencido de la región; % sobre su saldo pendiente | `v_account_balance` |
| Inactivas 30+ | Cuentas activas de la región sin actividad en 30+ días | `v_account_last_activity` |

La tabla de regiones siempre compara todas las regiones (el filtro de región
aplica a Dirección y Vendedores); clic en una región te lleva a las tarjetas de
vendedor filtradas a esa región.

---

## Notas de implementación

- Todo respeta los filtros globales de periodo y región vía URL
  (`?period=&region=&vista=`), como /reportes.
- La lógica de rangos (`rangeFor`) se extrajo de /reportes a
  `lib/kpis/period.ts` y ambas páginas la comparten; /tablero añade la opción
  "Mes actual".
- Paginación PostgREST: las consultas largas (`monthly_sales`, `activities`,
  `monthly_sales_items`, `accounts`, `products`) usan `selectAll` con `.range`
  para no perder filas después de las 1000 por default.
- Moneda MXN con `formatCurrency` (es-MX) y los nombres de vendedores/regiones
  tal como están en la base.
