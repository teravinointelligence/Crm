# Scripts operativos

## `recordatorio-contactos-vendedores.mjs`

Envía **un correo colectivo** a todos los vendedores (`sales_reps` con `role = 'rep'`
activos) recordándoles actualizar los **contactos de sus clientes** en el CRM, con
**copia (CC) a Sabrina**. El cuerpo incluye, por vendedor, cuántas cuentas tiene
asignadas, cuántas no tienen ningún contacto y cuántas no tienen correo de contacto.

El envío usa **Resend** (REST), el mismo proveedor que el CRM usa para cobranza
(`lib/email.ts`). El dominio `teravino.com` debe estar verificado en Resend.

### Vista previa (no envía)

```bash
DRY_RUN=1 node scripts/recordatorio-contactos-vendedores.mjs
```

### Envío real

```bash
node scripts/recordatorio-contactos-vendedores.mjs
```

### Variables de entorno

| Variable | Requerida | Default |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sí | — |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | — |
| `RESEND_API_KEY` | sí (envío real) | — |
| `CRM_FROM_EMAIL` | no | `TERAVINO CRM <cobranza@teravino.com>` |
| `CC_EMAIL` | no | `sabrina@teravino.com` |

## `reasignar-prospectos-inactivos.mjs`

Reasigna a la **admin** los **prospectos** que llevan N meses (default 2) sin
actividad de su vendedor, y recoge de paso los prospectos que quedaron sin dueño.
Cada movimiento se registra en `account_reassignment_log` con el dueño anterior,
así que es reversible.

Es distinto del **barrido automático** (`lib/reasignacion-inactivas.ts`), que
manda las cuentas al pool (`assigned_rep_id = null`) después de un aviso previo
al vendedor: aquí no hay aviso ni pool, las cuentas pasan directo a la admin.

Una cuenta **no** se toca si: ya es de la admin, tuvo actividad no cancelada
dentro del periodo, se creó dentro del periodo (prospecto recién registrado), o
tiene un pedido/cotización reciente de otro vendedor (movimiento comercial =
seguimiento, aunque no se haya capturado como actividad).

### Vista previa (no escribe)

```bash
DRY_RUN=1 node scripts/reasignar-prospectos-inactivos.mjs
```

### Aplicar

```bash
node scripts/reasignar-prospectos-inactivos.mjs
MESES=3 node scripts/reasignar-prospectos-inactivos.mjs   # otro umbral
```

### Variables de entorno

| Variable | Requerida | Default |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sí | — |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | — |
| `MESES` | no | `2` |
| `DRY_RUN` | no | — (vacío = aplica) |
