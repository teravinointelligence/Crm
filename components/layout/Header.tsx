import { Wordmark } from "@/components/brand/Wordmark";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "./UserMenu";
import { MobileMenu } from "./MobileMenu";
import { ROLE_LABEL, isRepartoOnlyRole } from "@/lib/modules";
import type { SalesRep } from "@/types/database";

export function Header({
  rep,
  isAdmin,
  modules = [],
  badges = {},
}: {
  rep: SalesRep;
  isAdmin: boolean;
  modules?: string[];
  badges?: Record<string, number>;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      {/* min-w-0 + truncate: en pantallas angostas (~390px) el lado izquierdo
          cede espacio en vez de empujar el avatar fuera del borde derecho. */}
      <div className="flex min-w-0 items-center gap-3">
        <MobileMenu isAdmin={isAdmin} modules={modules} badges={badges} role={rep.role} />
        <div className="shrink-0 lg:hidden">
          <Wordmark size="sm" />
        </div>
        <Badge variant={rep.role === "admin" ? "default" : "muted"} className="min-w-0">
          <span className="truncate">
            {rep.role === "admin"
              ? "Admin"
              : isRepartoOnlyRole(rep.role)
                ? ROLE_LABEL[rep.role as "chofer" | "jefe_logistica"]
                : rep.primary_region ?? "Vendedor"}
          </span>
        </Badge>
      </div>
      <UserMenu rep={rep} />
    </header>
  );
}
