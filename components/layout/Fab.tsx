import Link from "next/link";
import { CalendarPlus } from "lucide-react";

export function Fab() {
  return (
    <Link
      href="/actividades/nueva"
      aria-label="Registrar actividad"
      className="fixed bottom-16 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-carmesi text-white shadow-lg transition hover:bg-brand-carmesi-dark lg:hidden"
    >
      <CalendarPlus className="h-6 w-6" />
    </Link>
  );
}
