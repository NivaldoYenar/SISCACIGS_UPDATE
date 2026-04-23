import type { Metadata } from "next";
import "./globals.css";
import { MainNav } from "@/components/main-nav";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "ORF - Painel",
  description:
    "Painel de controle de cautela/descautela por reconhecimento facial",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100">
        <AuthProvider>
          <MainNav />
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
