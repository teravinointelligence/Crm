"use client";

import { useState } from "react";
import { Send, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EnviarDocumentoButton({ id, title }: { id: string; title: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function handleSend() {
    if (!confirm(`¿Enviar "${title}" por correo a los contactos de la cuenta?`)) return;
    setState("loading");
    try {
      const res = await fetch(`/api/documentos/${id}/enviar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Error al enviar");
        setState("error");
        return;
      }
      setMsg(`Enviado a ${data.recipients} contacto${data.recipients === 1 ? "" : "s"}`);
      setState("done");
    } catch {
      setMsg("Error de red");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle className="h-3.5 w-3.5" /> {msg}
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSend}
        disabled={state === "loading"}
        className="h-7 px-2 text-xs"
      >
        {state === "loading" ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Send className="mr-1 h-3 w-3" />
        )}
        Enviar
      </Button>
      {state === "error" && (
        <span className="text-xs text-red-600">{msg}</span>
      )}
    </div>
  );
}
