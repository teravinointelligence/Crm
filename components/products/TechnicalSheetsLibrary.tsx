"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileQuestion,
  FileText,
  FolderOpen,
  Link2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableScroll } from "@/components/ui/table-scroll";
import { Pager } from "@/components/ui/pagination";
import { usePagedRows } from "@/components/ui/use-paged-rows";
import { formatDateTime } from "@/lib/utils";
import type { DriveTechnicalSheet } from "@/lib/google-drive";
import type { TechnicalSheetProduct } from "@/lib/technical-sheet-library";

type SyncResponse = {
  error?: string;
  synced?: number;
  unchanged?: number;
  unmatched?: Array<{ id: string; name: string }>;
  missing?: number;
  errors?: Array<{ file: string; error: string }>;
};

export function TechnicalSheetsLibrary({
  products,
  driveFiles,
  driveFolder,
  driveError,
}: {
  products: TechnicalSheetProduct[];
  driveFiles: DriveTechnicalSheet[];
  driveFolder: { id: string; name: string; url: string } | null;
  driveError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const linkedFileIds = useMemo(
    () => new Set(products.map((product) => product.technical_sheet_drive_file_id).filter(Boolean)),
    [products],
  );
  const unmatchedFiles = driveFiles.filter((file) => !linkedFileIds.has(file.id));
  const linked = products.filter((product) => product.technical_sheet_drive_file_id).length;
  const ready = products.filter((product) => product.technical_sheet_path).length;
  const errors = products.filter((product) => product.technical_sheet_drive_sync_error).length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (status === "ready" && !product.technical_sheet_path) return false;
      if (status === "missing" && product.technical_sheet_path) return false;
      if (status === "error" && !product.technical_sheet_drive_sync_error) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.supplier, product.vintage]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [products, query, status]);
  const { paged, page, pageCount, setPage, total, pageSize } = usePagedRows(filtered);

  function synchronizeAll() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/fichas-tecnicas/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const body = (await response.json()) as SyncResponse;
        if (!response.ok) throw new Error(body.error || "No se pudo sincronizar Drive");
        const parts = [`${body.synced ?? 0} nuevas o actualizadas`, `${body.unchanged ?? 0} al día`];
        if (body.unmatched?.length) parts.push(`${body.unmatched.length} sin vincular`);
        if (body.errors?.length) parts.push(`${body.errors.length} con error`);
        toast.success("Sincronización terminada", { description: parts.join(" · ") });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo sincronizar Drive");
      }
    });
  }

  function linkFile(fileId: string) {
    const productId = selections[fileId];
    if (!productId) {
      toast.error("Selecciona el vino que corresponde a este PDF");
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch("/api/fichas-tecnicas/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveFileId: fileId, productId }),
        });
        const body = (await response.json()) as SyncResponse;
        if (!response.ok) throw new Error(body.error || "No se pudo vincular la ficha");
        toast.success("Ficha vinculada y sincronizada");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo vincular la ficha");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Fichas técnicas</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Google Drive conserva los PDFs maestros. El CRM los relaciona con cada vino y mantiene
            una copia privada para descargas y solicitudes de muestras.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {driveFolder && (
            <Button asChild variant="outline">
              <a href={driveFolder.url} target="_blank" rel="noreferrer">
                <FolderOpen className="mr-1 h-4 w-4" /> Abrir carpeta en Drive
              </a>
            </Button>
          )}
          <Button onClick={synchronizeAll} disabled={pending || Boolean(driveError)}>
            <RefreshCw className={`mr-1 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            Sincronizar Drive
          </Button>
        </div>
      </div>

      {driveError && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex gap-3 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-medium">Google Drive necesita atención</div>
              <div>{driveError}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Productos" value={products.length} icon={FileText} />
        <Metric label="PDFs en Drive" value={driveFiles.length} icon={FolderOpen} />
        <Metric label="Listos para muestras" value={ready} icon={CheckCircle2} />
        <Metric label="Pendientes" value={products.length - ready} icon={FileQuestion} danger={errors > 0} />
      </div>

      {unmatchedFiles.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="font-display text-xl">PDFs sin vincular</h2>
              <p className="text-sm text-muted-foreground">
                Elige el vino correspondiente. La próxima sincronización recordará la relación.
              </p>
            </div>
            <div className="space-y-3">
              {unmatchedFiles.map((file) => (
                <div key={file.id} className="grid gap-2 rounded-md border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Modificado {formatDateTime(file.modifiedTime)}
                    </div>
                  </div>
                  <Select
                    value={selections[file.id] || ""}
                    onValueChange={(value) => setSelections((current) => ({ ...current, [file.id]: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar vino…" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.supplier} · {product.name}{product.vintage ? ` · ${product.vintage}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => linkFile(file.id)} disabled={pending}>
                    <Link2 className="mr-1 h-4 w-4" /> Vincular
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar vino, SKU o proveedor…"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="md:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="ready">Listos</SelectItem>
                <SelectItem value="missing">Sin ficha</SelectItem>
                <SelectItem value="error">Con error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TableScroll>
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Drive</th>
                  <th className="px-3 py-2">CRM / Muestras</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((product) => (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <Link href={`/catalogo/${product.id}`} className="font-medium hover:text-brand-carmesi">
                        {product.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {product.supplier}{product.vintage ? ` · ${product.vintage}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">{product.sku || "—"}</td>
                    <td className="px-3 py-3">
                      {product.technical_sheet_drive_file_id ? (
                        <div>
                          <Badge variant="success">Vinculada</Badge>
                          <div className="mt-1 max-w-[230px] truncate text-xs text-muted-foreground">
                            {product.technical_sheet_drive_file_name}
                          </div>
                        </div>
                      ) : (
                        <Badge variant="muted">Sin vincular</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {product.technical_sheet_drive_sync_error ? (
                        <div>
                          <Badge variant="danger">Error</Badge>
                          <div className="mt-1 max-w-[260px] text-xs text-destructive">
                            {product.technical_sheet_drive_sync_error}
                          </div>
                        </div>
                      ) : product.technical_sheet_path ? (
                        <div>
                          <Badge variant="success">Lista</Badge>
                          {product.technical_sheet_drive_synced_at && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDateTime(product.technical_sheet_drive_synced_at)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="warning">Pendiente</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {product.technical_sheet_drive_url && (
                          <Button asChild size="sm" variant="ghost">
                            <a href={product.technical_sheet_drive_url} target="_blank" rel="noreferrer" title="Ver archivo maestro">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {product.technical_sheet_path && (
                          <Button asChild size="sm" variant="ghost">
                            <a href={`/api/catalogo/${product.id}/ficha-tecnica`} title="Descargar ficha">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <Pager
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
          <div className="text-xs text-muted-foreground">{total} productos · {linked} vinculados con Drive</div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  danger = false,
}: {
  label: string;
  value: number;
  icon: typeof FileText;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-md p-2 ${danger ? "bg-red-50 text-red-700" : "bg-brand-carmesi/10 text-brand-carmesi"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
