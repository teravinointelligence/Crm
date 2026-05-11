import { Wordmark } from "@/components/brand/Wordmark";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "./UserMenu";
import type { SalesRep } from "@/types/database";

export function Header({ rep }: { rep: SalesRep }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <div className="lg:hidden">
          <Wordmark size="sm" />
        </div>
        <Badge variant={rep.role === "admin" ? "default" : "muted"}>
          {rep.role === "admin" ? "Admin" : rep.primary_region ?? "Vendedor"}
        </Badge>
      </div>
      <UserMenu rep={rep} />
    </header>
  );
}
