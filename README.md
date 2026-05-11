# TERAVINO CRM

CRM operativo del equipo TERAVINO, S.A. de C.V. para gestión de clientes HORECA en Los Cabos, La Paz, Todos Santos, Tijuana, Puerto Vallarta y Nayarit.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + componentes estilo shadcn
- Supabase (Postgres + Auth + RLS + Storage)
- `@react-pdf/renderer` para cotizaciones
- `xlsx` (SheetJS) para imports desde CONTPAQi
- `recharts`, `sonner`, `lucide-react`

## Módulos en esta iteración (MVP de ventas)

| Módulo | Estado |
|---|---|
| Auth (email+password + magic link) | ✅ |
| Cuentas (lista, detalle con tabs, CRUD) | ✅ |
| Contactos (sub-recurso y vista global) | ✅ |
| Actividades (timeline, formulario con next step) | ✅ |
| Catálogo (CRUD, precios duales por región, import Excel) | ✅ |
| Pedidos / Cotizaciones (numeración, precio por región, PDF) | ✅ |
| Dashboard (KPIs, próximos pasos, top cuentas) | ✅ |
| Cartera, Restock, Tránsito, Cuentas por Pagar, Email | ⏳ iteración siguiente |

El schema completo del prompt ya está aplicado (tablas e índices para Cartera, Restock, Tránsito y Cuentas por Pagar) — solo falta UI.

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

| Email | Rol | Contraseña temporal |
|---|---|---|
| sabrina@teravino.com | admin | Teravino2026! |
| yamile@teravino.com | rep (Los Cabos) | Teravino2026! |
| citlali@teravino.com | rep (La Paz) | Teravino2026! |
| andra@teravino.com | rep (Puerto Vallarta) | Teravino2026! |
| emmanuel@teravino.com | rep (Tijuana) | Teravino2026! |
| felix@teravino.com | rep (Nayarit) | Teravino2026! |

> Cambiar contraseñas en producción y confirmar el correo real de Sabrina.

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
