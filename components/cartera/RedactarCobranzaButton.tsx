"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle, Sparkles, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Channel = "email" | "whatsapp";
type Tono = "amable" | "firme" | "formal";

type Draft = {
  channel: Channel;
  tono: Tono;
  suspendido: boolean;
  cliente: string;
  subject: string;
  body: string;
  factsText: string;
  emails: string[];
  whatsapp: string | null;
};

const TONO_BADGE: Record<Tono, { variant: "success" | "warning" | "danger"; label: string }> = {
  amable: { variant: "success", label: "Tono amable" },
  firme: { variant: "warning", label: "Tono firme" },
  formal: { variant: "danger", label: "Tono formal · suspensión" },
};

export function RedactarCobranzaButton({
  accountId,
  clientName,
  size = "default",
  variant = "outline",
}: {
  accountId: string;
  clientName: string;
  size?: "default" | "sm";
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("email");
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<Channel, Draft>>>({});
  const [subject, setSubject] = useState("");
  const [bodyEdit, setBodyEdit] = useState("");
  const [recipient, setRecipient] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const loadInto = useCallback((d: Draft) => {
    setSubject(d.subject);
    setBodyEdit(d.body);
    setRecipient(d.channel === "email" ? d.emails[0] ?? "" : d.whatsapp ?? "");
  }, []);

  const fetchDraft = useCallback(
    async (ch: Channel) => {
      setConfirming(false);
      const cached = drafts[ch];
      if (cached) {
        loadInto(cached);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/cartera/${accountId}/cobranza/draft`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel: ch }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo generar el borrador.");
        const d: Draft = { ...data, channel: ch };
        setDrafts((prev) => ({ ...prev, [ch]: d }));
        loadInto(d);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al generar el borrador.");
      } finally {
        setLoading(false);
      }
    },
    [accountId, drafts, loadInto],
  );

  const openDialog = () => {
    setOpen(true);
    setChannel("email");
    fetchDraft("email");
  };

  const switchChannel = (ch: string) => {
    const c = ch as Channel;
    setChannel(c);
    fetchDraft(c);
  };

  const current = drafts[channel];

  const doSend = async () => {
    if (!current) return;
    setSending(true);
    try {
      const res = await fetch(`/api/cartera/${accountId}/cobranza/registrar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel,
          tono: current.tono,
          recipient,
          subject,
          body: bodyEdit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar el contacto.");

      const fullText = `${bodyEdit.trim()}\n\n${current.factsText}`;
      if (data.sent) {
        toast.success("Correo enviado y registrado.");
      } else if (channel === "email") {
        const href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullText)}`;
        window.open(href, "_blank");
        toast.success("Contacto registrado. Abrí tu correo con el texto listo.");
      } else {
        const href = `https://wa.me/${recipient.replace(/\D/g, "")}?text=${encodeURIComponent(fullText)}`;
        window.open(href, "_blank");
        toast.success("Contacto registrado. Abrí WhatsApp con el texto listo.");
      }
      setOpen(false);
      setConfirming(false);
      setDrafts({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar.");
    } finally {
      setSending(false);
    }
  };

  const canSend = !!recipient && !!bodyEdit.trim() && !loading;

  return (
    <>
      <Button variant={variant} size={size} onClick={openDialog}>
        <Sparkles className="mr-1 h-4 w-4" /> Redactar cobranza
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirming(false); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cobranza — {clientName}</DialogTitle>
          </DialogHeader>

          <Tabs value={channel} onValueChange={switchChannel}>
            <TabsList>
              <TabsTrigger value="email">
                <Mail className="mr-1 h-4 w-4" /> Correo
              </TabsTrigger>
              <TabsTrigger value="whatsapp">
                <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
              </TabsTrigger>
            </TabsList>

            {(["email", "whatsapp"] as Channel[]).map((ch) => (
              <TabsContent key={ch} value={ch} className="space-y-3 pt-2">
                {loading && !current ? (
                  <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generando borrador con IA…
                  </div>
                ) : current ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant={TONO_BADGE[current.tono].variant}>
                        {TONO_BADGE[current.tono].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Revisa y edita antes de enviar. Las cifras se adjuntan automáticamente.
                      </span>
                    </div>

                    {/* Destinatario */}
                    {ch === "email" ? (
                      current.emails.length ? (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Para</label>
                          <Select value={recipient} onValueChange={setRecipient}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Elige el correo…" />
                            </SelectTrigger>
                            <SelectContent>
                              {current.emails.map((e) => (
                                <SelectItem key={e} value={e}>{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                          Este cliente no tiene correo registrado. Agrégalo en la ficha de la cuenta.
                        </p>
                      )
                    ) : current.whatsapp ? (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">WhatsApp</label>
                        <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} className="h-9" />
                      </div>
                    ) : (
                      <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                        Este cliente no tiene teléfono/WhatsApp registrado. Agrégalo en la ficha de la cuenta.
                      </p>
                    )}

                    {/* Asunto (solo correo) */}
                    {ch === "email" && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Asunto</label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9" />
                      </div>
                    )}

                    {/* Cuerpo editable */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Mensaje</label>
                      <Textarea
                        value={bodyEdit}
                        onChange={(e) => setBodyEdit(e.target.value)}
                        rows={ch === "whatsapp" ? 6 : 8}
                      />
                    </div>

                    {/* Cifras (código, no editable) */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Cifras adjuntas (automáticas, importes reales)
                      </label>
                      <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs text-foreground">
                        {current.factsText}
                      </pre>
                    </div>

                    {/* Envío: acción separada con confirmación explícita */}
                    {!confirming ? (
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                        <Button onClick={() => setConfirming(true)} disabled={!canSend}>
                          <Send className="mr-1 h-4 w-4" />
                          {ch === "email" ? "Enviar correo…" : "Enviar WhatsApp…"}
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-md border border-brand-carmesi/30 bg-accent/10 p-3">
                        <p className="mb-2 text-sm">
                          Se registrará el contacto en la bitácora y se abrirá tu{" "}
                          {ch === "email" ? "correo" : "WhatsApp"} con el texto listo para enviar. ¿Confirmas?
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setConfirming(false)} disabled={sending}>
                            Volver a editar
                          </Button>
                          <Button onClick={doSend} disabled={sending || !canSend}>
                            {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                            Confirmar
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="py-6 text-sm text-muted-foreground">No se pudo cargar el borrador.</p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
