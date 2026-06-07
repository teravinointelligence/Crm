"use client";

import { useMemo, useState } from "react";
import { Mail, Send, Check, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SemaforoBadge } from "@/components/cartera/SemaforoBadge";
import { formatCurrency } from "@/lib/utils";
import type { AccountBalance } from "@/types/database";

type EstadoEnvio = "idle" | "enviando" | "ok" | "error";
type Resultado = { estado: EstadoEnvio; mensaje?: string; to?: string };

type Borrador =
  | { estado: "cargando" }
  | { estado: "listo"; to: string; subject: string; html: string }
  | { estado: "error"; mensaje: string };

export function CobranzaEmails({ rows }: { rows: AccountBalance[] }) {
  const [open, setOpen] = useState(false);
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);

  const pendientes = useMemo(
    () =>
      rows
        .filter((r) => (r.saldo_pendiente ?? 0) > 0)
        .sort((a, b) => (b.saldo_vencido ?? 0) - (a.saldo_vencido ?? 0)),
    [rows],
  );

  const vencidas = pendientes.filter((r) => (r.saldo_vencido ?? 0) > 0);
  const porVencer = pendientes.filter((r) => (r.saldo_vencido ?? 0) <= 0);

  const totalVencido = vencidas.reduce((s, r) => s + (r.saldo_vencido ?? 0), 0);
  const totalPorVencer = porVencer.reduce((s, r) => s + (r.saldo_pendiente ?? 0), 0);

  async function cargarBorrador(accountId: string) {
    setBorradores((m) => ({ ...m, [accountId]: { estado: "cargando" } }));
    try {
      const res = await fetch(`/api/cartera/${accountId}/recordatorio`, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBorradores((m) => ({
          ...m,
          [accountId]: { estado: "error", mensaje: data.error ?? `HTTP ${res.status}` },
        }));
        return;
      }
      setBorradores((m) => ({
        ...m,
        [accountId]: { estado: "listo", to: data.to, subject: data.subject, html: data.html },
      }));
    } catch (e) {
      setBorradores((m) => ({
        ...m,
        [accountId]: { estado: "error", mensaje: e instanceof Error ? e.message : "Error de red" },
      }));
    }
  }

  function toggleBorrador(accountId: string) {
    const abierto = !expandido[accountId];
    setExpandido((m) => ({ ...m, [accountId]: abierto }));
    if (abierto && !borradores[accountId]) cargarBorrador(accountId);
  }

  async function enviarUno(accountId: string): Promise<boolean> {
    setResultados((m) => ({ ...m, [accountId]: { estado: "enviando" } }));
    try {
      const res = await fetch(`/api/cartera/${accountId}/recordatorio`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResultados((m) => ({
          ...m,
          [accountId]: { estado: "error", mensaje: data.error ?? `HTTP ${res.status}` },
        }));
        return false;
      }
      setResultados((m) => ({ ...m, [accountId]: { estado: "ok", to: data.to } }));
      return true;
    } catch (e) {
      setResultados((m) => ({
        ...m,
        [accountId]: { estado: "error", mensaje: e instanceof Error ? e.message : "Error de red" },
      }));
      return false;
    }
  }

  async function enviarLote(lista: AccountBalance[]) {
    if (enviando || lista.length === 0) return;
    const ok = window.confirm(
      `Vas a enviar ${lista.length} correo(s) de cobranza a los clientes. ¿Autorizar el envío?`,
    );
    if (!ok) return;
    setEnviando(true);
    let enviados = 0;
    let fallidos = 0;
    for (const r of lista) {
      const success = await enviarUno(r.account_id);
      if (success) enviados++;
      else fallidos++;
    }
    setEnviando(false);
    const fn = fallidos ? toast.warning : toast.success;
    fn("Cobranza enviada", {
      description: `${enviados} enviado(s)${fallidos ? `, ${fallidos} con problema` : ""}`,
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Mail className="mr-1 h-4 w-4" /> Correos de cobranza
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !enviando && setOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b px-6 py-4">
              <div>
                <h2 className="font-display text-xl">Correos de cobranza</h2>
                <p className="text-sm text-muted-foreground">
                  Revisa el borrador de cada cliente y autoriza el envío.
                </p>
              </div>
              <button
                onClick={() => !enviando && setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                disabled={enviando}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-6 py-3">
              <Button
                size="sm"
                onClick={() => enviarLote(pendientes)}
                disabled={enviando || pendientes.length === 0}
              >
                {enviando ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Autorizar y enviar a todos ({pendientes.length})
              </Button>
              {vencidas.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => enviarLote(vencidas)}
                  disabled={enviando}
                >
                  Solo vencidas ({vencidas.length})
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                Vencido {formatCurrency(totalVencido)} · Por vencer {formatCurrency(totalPorVencer)}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {pendientes.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No hay cartera vencida ni por vencer.
                </div>
              ) : (
                <div className="space-y-4">
                  {vencidas.length > 0 && (
                    <Seccion titulo="Vencidas">
                      {vencidas.map((r) => (
                        <Fila
                          key={r.account_id}
                          row={r}
                          resultado={resultados[r.account_id]}
                          borrador={borradores[r.account_id]}
                          expandido={!!expandido[r.account_id]}
                          onToggle={() => toggleBorrador(r.account_id)}
                          onEnviar={() => enviarUno(r.account_id)}
                          enviandoLote={enviando}
                        />
                      ))}
                    </Seccion>
                  )}
                  {porVencer.length > 0 && (
                    <Seccion titulo="Por vencer">
                      {porVencer.map((r) => (
                        <Fila
                          key={r.account_id}
                          row={r}
                          resultado={resultados[r.account_id]}
                          borrador={borradores[r.account_id]}
                          expandido={!!expandido[r.account_id]}
                          onToggle={() => toggleBorrador(r.account_id)}
                          onEnviar={() => enviarUno(r.account_id)}
                          enviandoLote={enviando}
                        />
                      ))}
                    </Seccion>
                  )}
                </div>
              )}
            </div>

            <div className="border-t px-6 py-3 text-right text-xs text-muted-foreground">
              El correo se envía al contacto principal de cada cuenta desde cobranza@teravino.com.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div className="divide-y rounded-lg border">{children}</div>
    </div>
  );
}

function Fila({
  row,
  resultado,
  borrador,
  expandido,
  onToggle,
  onEnviar,
  enviandoLote,
}: {
  row: AccountBalance;
  resultado?: Resultado;
  borrador?: Borrador;
  expandido: boolean;
  onToggle: () => void;
  onEnviar: () => void;
  enviandoLote: boolean;
}) {
  const estado = resultado?.estado ?? "idle";
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onToggle} className="flex min-w-0 items-start gap-2 text-left">
          {expandido ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-medium">{row.business_name ?? "Sin nombre"}</span>
              <SemaforoBadge
                saldoPendiente={row.saldo_pendiente ?? 0}
                saldoVencido={row.saldo_vencido ?? 0}
                diasVencido={row.dias_vencido}
              />
            </span>
            <span className="block text-xs text-muted-foreground">
              Pendiente {formatCurrency(row.saldo_pendiente)}
              {(row.saldo_vencido ?? 0) > 0 && (
                <span className="text-red-600"> · Vencido {formatCurrency(row.saldo_vencido)}</span>
              )}
              {(row.facturas_abiertas ?? 0) > 0 && ` · ${row.facturas_abiertas} factura(s)`}
            </span>
            {estado === "ok" && resultado?.to && (
              <span className="block text-xs text-green-600">Enviado a {resultado.to}</span>
            )}
            {estado === "error" && (
              <span className="block text-xs text-red-600">{resultado?.mensaje}</span>
            )}
          </span>
        </button>
        <Button
          size="sm"
          variant="outline"
          onClick={onToggle}
          disabled={estado === "enviando"}
        >
          {expandido ? "Ocultar" : "Ver borrador"}
        </Button>
      </div>

      {expandido && (
        <div className="mt-3 rounded-lg border bg-muted/20 p-3">
          {!borrador || borrador.estado === "cargando" ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando borrador…
            </div>
          ) : borrador.estado === "error" ? (
            <div className="py-4 text-sm text-red-600">{borrador.mensaje}</div>
          ) : (
            <>
              <div className="mb-2 space-y-0.5 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Para:</span> {borrador.to}
                </div>
                <div>
                  <span className="font-medium text-foreground">Asunto:</span> {borrador.subject}
                </div>
              </div>
              <div
                className="max-h-72 overflow-y-auto rounded border bg-white p-3"
                dangerouslySetInnerHTML={{ __html: borrador.html }}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant={estado === "ok" ? "outline" : "default"}
                  onClick={onEnviar}
                  disabled={estado === "enviando" || enviandoLote}
                >
                  {estado === "enviando" ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : estado === "ok" ? (
                    <Check className="mr-1 h-4 w-4" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  {estado === "ok" ? "Reenviar" : "Autorizar y enviar"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
