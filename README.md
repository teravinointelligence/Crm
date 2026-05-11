# TERAVINO CRM

CRM operativo del equipo TERAVINO, S.A. de C.V. para gestión de clientes HORECA en Los Cabos, La Paz, Todos Santos, Tijuana, Puerto Vallarta y Nayarit.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + componentes estilo shadcn
- Supabase (Postgres + Auth + RLS + Storage)
- `@react-pdf/renderer` para cotizaciones
- `xlsx` (SheetJS) para imports desde CONTPAQi
- `recharts`, `sonner`, `lucide-react`

## Módulos

| Módulo | Estado |
|---|---|
| Auth (email+password + magic link) | ✅ |
| Cuentas (lista, detalle con tabs, CRUD) | ✅ |
| Contactos (sub-recurso y vista global) | ✅ |
| Actividades (timeline, formulario con next step) | ✅ |
| Catálogo (CRUD, precios duales por región, import Excel) | ✅ |
| Pedidos / Cotizaciones (numeración, precio por región, PDF) | ✅ |
| Dashboard (KPIs, próximos pasos, top cuentas) | ✅ |
| Cartera de clientes (facturas, pagos FIFO, PDF estado de cuenta, import Excel) | ✅ |
| Restock (vendedor pide → admin aprueba/ajusta) | ✅ |
| Tránsito (qué viene en camino, OCs, factura proveedor, recepción) | ✅ |
| Cuentas por Pagar (saldos por proveedor, registro de pagos, admin-only) | ✅ |
| Notificaciones email (Resend) | ⏳ siguiente |

### Datos reales
- Las 332 cuentas HORECA se importaron desde HubSpot (companies), mapeadas a región/tier/vendedor. El `accounts.hubspot_company_id` permite re-sincronizar.
- Los **contactos** de HubSpot no se importaron en bloque: los registros de contacto de esta cuenta de HubSpot no llevan la propiedad `associatedcompanyid`, así que no se pueden ligar a una cuenta de forma fiable. Se pueden agregar por cuenta dentro del CRM o vía una sincronización dirigida (consulta por empresa) más adelante.

## Setup local

```bash
pnpm install
cp .env.example .env.local
# Llenar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm dev
```

## Supabase

- Proyecto: `teravino-crm` (`tbpstqkorhkdfedqiblr`)
- Region: `us-east-1`
- Migraciones aplicadas (vía MCP):
  - `0001_schema` — todas las tablas, vistas, índices, funciones
  - `0002_rls` — políticas por rol (admin / rep)
  - `0003_seed` — 6 vendedores, 5 cuentas demo, 15 productos, 3 actividades
  - `0004_security_fixes` — views como SECURITY INVOKER + search_path en funciones

Si necesitas reaplicar el schema en otro proyecto, los archivos están en `supabase/migrations/`.

## Cuentas pre-creadas

Cada vendedor solo ve las cuentas y contactos que tiene asignados (heredados del owner en HubSpot), vía Row Level Security. Sabrina (admin) ve todo.

| Email | Rol | Contraseña temporal |
|---|---|---|
| sabrina@teravino.com | admin | `Teravino-Sabrina-2026` |
| yamile@teravino.com | rep | `Teravino-Yamile-2026` |
| citlali@teravino.com | rep | `Teravino-Citlali-2026` |
| andra@teravino.com | rep | `Teravino-Andra-2026` |
| emmanuel@teravino.com | rep | `Teravino-Emmanuel-2026` |
| felix@teravino.com | rep | `Teravino-Felix-2026` |

> Son contraseñas temporales — cada uno debe cambiarla en su primer ingreso (Perfil / o vía "enlace mágico" para resetear).

## Reglas de precio por región

Centralizadas en `lib/pricing.ts` y en la función SQL `get_product_price`:

- **base**: Los Cabos, Puerto Vallarta, Nayarit, Todos Santos → `base_price` tal cual
- **+10%**: La Paz, Tijuana → `base_price × 1.10`
- IVA 16% se calcula al final del subtotal.

Al crear una cotización, el `unit_price` se calcula automáticamente según el `price_tier` del cliente.

## Imports desde CONTPAQi

CONTPAQi no expone API; toda sincronización es manual vía Excel. Hay dos plantillas en `/public/templates/`:

- `plantilla_stock.csv` — uso frecuente (solo SKU + Stock). Actualiza `stock_quantity`, `last_stock_update`, `last_stock_source`.
- `plantilla_productos.csv` — catálogo completo. Hace upsert por SKU.

Cada import queda registrado en `inventory_imports` con el log de errores.

## Comandos

```bash
pnpm dev        # desarrollo
pnpm build      # producción
pnpm start      # servidor de producción
pnpm typecheck  # tsc --noEmit
pnpm lint       # next lint
```

## Deploy a Vercel

1. Importa el repo en Vercel.
2. Variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy. La middleware ya protege todas las rutas excepto `/login`.

## TODO siguientes iteraciones (`TODO(v2)` en código)

- Cartera de clientes (facturas, pagos, PDF estado de cuenta).
- Pedidos de restock vendedor → admin → OC.
- Tránsito de productos.
- Cuentas por Pagar (admin only).
- Notificaciones por email (Resend + Edge Function).
- Integración con TERAVINO Tasks (vista `v_accounts_summary` + Realtime ya listos a nivel SQL).
