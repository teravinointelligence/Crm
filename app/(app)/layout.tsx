import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header rep={rep} />
        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-8">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
