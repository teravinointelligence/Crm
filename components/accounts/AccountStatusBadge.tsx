import { Badge } from "@/components/ui/badge";

const variantFor: Record<string, "success" | "muted" | "warning" | "danger" | "outline"> = {
  activo: "success",
  prospecto: "warning",
  inactivo: "muted",
  perdido: "danger",
  cerrado: "outline",
};

export function AccountStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  return <Badge variant={variantFor[status] ?? "muted"}>{status}</Badge>;
}
