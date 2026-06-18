// Tipos y catálogos de las solicitudes de transferencia entre almacenes.
// Puro (sin server-only) para importarlo desde componentes cliente.
// Tabla: warehouse_transfer_requests (migración 0074).

export const TRANSFER_STATUS = ["pendiente", "aprobada", "rechazada", "completada"] as const;
export type TransferStatus = (typeof TRANSFER_STATUS)[number];

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  completada: "Completada",
};

export const TRANSFER_STATUS_VARIANT: Record<TransferStatus, "warning" | "success" | "danger" | "muted"> = {
  pendiente: "warning",
  aprobada: "success",
  rechazada: "danger",
  completada: "muted",
};

export type TransferRequest = {
  id: string;
  product_id: string | null;
  product_label: string;
  from_warehouse: string;
  to_warehouse: string;
  quantity: number;
  reason: string | null;
  status: TransferStatus;
  admin_notes: string | null;
  created_at: string;
  decided_at: string | null;
  requested_by: string | null;
  requester_name?: string | null;
};
