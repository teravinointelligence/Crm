import { Wordmark } from "@/components/brand/Wordmark";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Acceso — TERAVINO CRM" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  return (
    <main className="grid min-h-screen w-full lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-carmesi to-brand-carmesi-dark p-12 text-white lg:flex">
        <Wordmark size="lg" className="text-white" />
        <div className="space-y-3">
          <p className="font-display text-3xl leading-snug">
            “El vino fino merece un seguimiento fino.”
          </p>
          <p className="text-sm text-white/70">
            Plataforma operativa del equipo TERAVINO — Los Cabos · La Paz ·
            Todos Santos · Vallarta · Nayarit · Tijuana
          </p>
        </div>
        <div className="brand-divider opacity-50" />
      </section>
      <section className="flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:hidden">
            <Wordmark size="lg" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl sm:text-3xl">Acceso</h1>
            <p className="text-sm text-muted-foreground">
              Ingresa con tu correo @teravino.com.
            </p>
          </div>
          <LoginForm redirectTo={searchParams.redirect ?? "/"} />
        </div>
      </section>
    </main>
  );
}
