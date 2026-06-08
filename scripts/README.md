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
