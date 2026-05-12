"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DocumentLink({ path, label }: { path: string; label: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const open = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from("documentos").createSignedUrl(path, 120);
    setLoading(false);
    if (error || !data?.signedUrl) {
      toast.error("No pude abrir el documento", { description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-1 text-sm text-brand-carmesi hover:underline disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" /> {loading ? "Abriendo…" : label}
    </button>
  );
}
