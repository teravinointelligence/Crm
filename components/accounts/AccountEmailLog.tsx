// Panel "Últimos envíos al cliente" en la ficha de la cuenta. Muestra la fecha
// del último correo enviado por tipo (portafolio, estado de cuenta, promoción…)
// desde la bitácora client_email_log. Presentacional.

import { Card, CardContent } from "@/components/ui/card";
import { Send } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { EMAIL_KIND_LABEL, type ClientEmailKind } from "@/lib/email-log";

export type LastSend = {
  kind: string;
  created_at: string;
  recipient_count: number;
};

export function AccountEmailLog({ sends }: { sends: LastSend[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-brand-carmesi" />
          <h3 className="font-display text-base">Últimos envíos al cliente</h3>
        </div>

        {sends.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no se ha registrado ningún envío a este cliente.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {sends.map((s) => (
              <li key={s.kind} className="flex items-center justify-between gap-3 py-1.5">
                <span className="font-medium">
                  {EMAIL_KIND_LABEL[s.kind as ClientEmailKind] ?? s.kind}
                </span>
                <span className="text-right text-muted-foreground">
                  {formatDateTime(s.created_at)}
                  {s.recipient_count > 1 ? ` · ${s.recipient_count} correos` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
