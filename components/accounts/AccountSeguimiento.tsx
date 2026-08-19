// Pestaña "Seguimiento" de la ficha de cuenta: todo lo que el vendedor necesita
// saber y anotar del cliente que no es un pedido ni una factura.
//
// Antes esto eran solo citas (visitas de proveedor y eventos). Ahora junta tres
// cosas en un mismo lugar:
//   · si la cuenta puede comprar hoy (y por qué no),
//   · la bitácora de notas de la cuenta,
//   · las citas y eventos que ya existían.
//
// Server component: carga con el cliente de sesión, así que la RLS ya acota.
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AccountNotes } from "@/components/accounts/AccountNotes";
import { AccountPurchaseBlocks } from "@/components/accounts/AccountPurchaseBlocks";
import { AccountVisitas } from "@/components/accounts/AccountVisitas";
import { loadAccountNotes } from "@/lib/account-seguimiento";
import type { PurchaseBlock } from "@/lib/purchase-blocks";
import { activeBlockOn } from "@/lib/purchase-blocks";
import { SIN_FACTURAR_DAYS } from "@/lib/rep-tasks";
import { dateKeyTz, formatDate } from "@/lib/utils";

export async function AccountSeguimiento({
  accountId,
  repId,
  repName,
  isAdmin,
  canEdit,
  blocks,
  lastInvoiceDate,
}: {
  accountId: string;
  /** Vendedor que está viendo la ficha: queda como autor de lo que capture. */
  repId: string;
  repName: string | null;
  isAdmin: boolean;
  canEdit: boolean;
  /** Pausas de compra de la cuenta. Las carga la página, que ya las necesita
   *  para el aviso del Resumen: así no se consultan dos veces. */
  blocks: PurchaseBlock[];
  /** Fecha de la última factura en cartera (`YYYY-MM-DD`), o null si nunca. */
  lastInvoiceDate: string | null;
}) {
  const supabase = createClient();
  const today = dateKeyTz(new Date());
  const notes = await loadAccountNotes(supabase, accountId);

  const active = activeBlockOn(blocks, today);
  const diasSinFacturar = lastInvoiceDate
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastInvoiceDate.slice(0, 10)}T00:00:00Z`)) /
            86_400_000,
        ),
      )
    : null;
  // La alerta se calla si la cuenta tiene prohibido comprar: ahí no hay nada
  // que reactivar, y es justo el caso que hacía ignorable el correo semanal.
  const alerta = !active && diasSinFacturar !== null && diasSinFacturar >= SIN_FACTURAR_DAYS;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          {alerta ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="text-sm">
                <p className="font-medium text-red-700">
                  Lleva {diasSinFacturar} días sin facturar
                </p>
                <p className="text-muted-foreground">
                  Última factura: {formatDate(lastInvoiceDate)}. Pasado un mes sin compra, el
                  CRM le avisa a su vendedor por correo y le abre la tarea en “Mi día”. Si es
                  porque no puede comprar, márcalo aquí abajo y la alerta se detiene.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-muted-foreground">
                {active
                  ? "Alerta de facturación pausada mientras la cuenta no pueda comprar."
                  : diasSinFacturar === null
                    ? "Todavía no hay facturas de esta cuenta en cartera."
                    : `Última factura hace ${diasSinFacturar} días (${formatDate(lastInvoiceDate)}).`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <AccountPurchaseBlocks
            accountId={accountId}
            repId={repId}
            today={today}
            blocks={blocks}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <AccountNotes
            accountId={accountId}
            repId={repId}
            repName={repName}
            isAdmin={isAdmin}
            notes={notes}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      <AccountVisitas accountId={accountId} />
    </div>
  );
}
