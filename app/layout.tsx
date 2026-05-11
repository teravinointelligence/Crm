import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TERAVINO CRM",
  description: "CRM operativo para el equipo TERAVINO",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster
          position="top-right"
          richColors
          theme="light"
          toastOptions={{
            classNames: {
              toast: "font-sans border-border",
            },
          }}
        />
      </body>
    </html>
  );
}
