"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";

const links = [
  { href: "/", label: "Dashboard", requireAdmin: false },
  { href: "/items", label: "Itens", requireAdmin: false },
  { href: "/movements", label: "Movimentações", requireAdmin: false },
  { href: "/users", label: "Gerenciar usuários", requireAdmin: false },
];

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold tracking-tight text-slate-200">
          ORF • Controle de Materiais
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <div className="flex gap-2">
            {links.map((link) => {
              if (link.requireAdmin && user?.role !== "ADMIN") return null;

              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    "rounded-full px-3 py-1 transition-colors " +
                    (active
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-300 hover:bg-slate-800")
                  }>
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="ml-4 flex items-center gap-3">
            {user ? (
              <>
                <span className="text-xs text-slate-400">
                  {user.name} ({user.role})
                </span>
                <button
                  onClick={() => {
                    logout();
                    router.push("/login");
                  }}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
                  Sair
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
                Entrar
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
