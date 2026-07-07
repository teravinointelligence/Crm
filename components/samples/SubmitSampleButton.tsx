"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SubmitSampleButton({ requestId, requestNumber }: { requestId: string; requestNumber: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async () => {
    setPending(true);
    const { error } = await supabase
      .from("sample_requests")
      .update({ status: "enviada" })
      .eq("id", requestId);

    if (error) {
      toast.error("No se pudo enviar la solicitud", { description: error.message });
      setPending(false);
      return;
    }

    // Notificar al admin sin bloquear.
    fetch(`/api/samples/${requestId}/notificar-admin`, { method: "POST" }).catch(() => null);

    toast.success(`${requestNumber} enviada`);
    router.refresh();
    setPending(false);
  };

  return (
    <Button size="sm" onClick={handleSubmit} disabled={pending}>
      <Send className="mr-1 h-4 w-4" />
      {pending ? "Enviando…" : "Enviar solicitud"}
    </Button>
  );
}
