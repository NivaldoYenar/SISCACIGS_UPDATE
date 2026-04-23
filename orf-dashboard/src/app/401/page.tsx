// app/401/page.tsx
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-md w-full text-center p-8 rounded-2xl bg-slate-950/60 border border-slate-700">
        <p className="text-sm font-mono text-slate-400 mb-2">Erro 401</p>
        <h1 className="text-2xl font-semibold mb-4">
          Você não está autenticado
        </h1>
        <p className="text-slate-300 mb-6">
          Para acessar esta área você precisa estar logado. Faça login novamente
          e tente de novo.
        </p>

        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium">
            Ir para login
          </Link>

          <Link
            href="/"
            className="px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-400 text-sm font-medium">
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
