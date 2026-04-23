// app/403/page.tsx
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-md w-full text-center p-8 rounded-2xl bg-slate-950/60 border border-slate-700">
        <p className="text-sm font-mono text-slate-400 mb-2">Erro 403</p>
        <h1 className="text-2xl font-semibold mb-4">Acesso negado</h1>
        <p className="text-slate-300 mb-6">
          Você está logado, mas não tem permissão para acessar este recurso. Se
          você acha que isso é um erro, fale com o administrador do sistema.
        </p>

        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium">
            Voltar ao dashboard
          </Link>

          <Link
            href="/users"
            className="px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-400 text-sm font-medium">
            Ver usuários
          </Link>
        </div>
      </div>
    </main>
  );
}
