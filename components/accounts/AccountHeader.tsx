import Link from "next/link";
import { Phone, Mail, MapPin, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountStatusBadge } from "./AccountStatusBadge";
import type { Account, SalesRep } from "@/types/database";

type Props = {
  account: Account;
  rep: SalesRep | null;
};

export function AccountHeader({ account, rep }: Props) {
  return (
    <div className="rounded-lg border bg-card p-6 brand-shadow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl">{account.business_name}</h1>
            <AccountStatusBadge status={account.status} />
            {account.price_tier === "+10" && (
              <Badge variant="accent">+10%</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {account.account_type && <span>{account.account_type}</span>}
            {account.region && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {account.region}
                {account.city ? ` · ${account.city}` : ""}
              </span>
            )}
            {rep && <span>Vendedor: {rep.full_name}</span>}
            {account.rfc && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {account.rfc}
              </span>
            )}
          </div>
          {account.address && (
            <p className="text-sm text-muted-foreground">{account.address}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/cuentas/${account.id}/editar`}>Editar</Link>
          </Button>
          <Button asChild>
            <Link href={`/actividades/nueva?account=${account.id}`}>
              <Phone className="mr-1 h-4 w-4" /> Registrar visita
            </Link>
          </Button>
          <Button asChild variant="accent">
            <Link href={`/pedidos/nuevo?account=${account.id}`}>
              <Mail className="mr-1 h-4 w-4" /> Nueva cotización
            </Link>
          </Button>
        </div>
      </div>
      {account.notes && (
        <p className="mt-4 border-t pt-4 text-sm text-foreground/80">
          {account.notes}
        </p>
      )}
    </div>
  );
}
