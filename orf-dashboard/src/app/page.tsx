import { fetchItemsSummary, fetchRecentMovements } from "@/lib/centralApi";
import { RequireAuth } from "@/components/require-auth";
import { HomeQuickActions } from "@/components/home-quick-actions";

export const dynamic = "force-dynamic";

type ItemsSummary = {
  total: number;
  emprestados: number;
  disponiveis: number;
  em_manutencao: number;
  perdidos: number;
};

const EMPTY_SUMMARY: ItemsSummary = {
  total: 0,
  emprestados: 0,
  disponiveis: 0,
  em_manutencao: 0,
  perdidos: 0,
};

export default async function HomePage() {
  let summary: ItemsSummary = EMPTY_SUMMARY;
  let movements: Awaited<ReturnType<typeof fetchRecentMovements>> = [];
  let hasError = false;

  try {
    const [summaryRes, movementsRes] = await Promise.all([
      fetchItemsSummary(),
      fetchRecentMovements(10),
    ]);

    summary = summaryRes;
    movements = movementsRes;
  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
    hasError = true;
  }

  // Se deu erro em qualquer uma das chamadas (caso típico do USER com 403),
  // não mostra o painel, só a tela de acesso negado.
  if (hasError) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
          <div className="max-w-2xl mx-auto space-y-4">
            <h1 className="text-2xl font-semibold">Acesso negado</h1>
            <p className="text-slate-400 text-sm">
              Você não possui permissão para visualizar este painel.
            </p>
          </div>
        </main>
      </RequireAuth>
    );
  }

  const { total, emprestados, disponiveis, em_manutencao, perdidos } = summary;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Painel ORF</h1>
            <HomeQuickActions />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">Itens cadastrados</div>
              <div className="text-3xl font-semibold">{total}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">Emprestados</div>
              <div className="text-3xl font-semibold">{emprestados}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">Disponíveis</div>
              <div className="text-3xl font-semibold">{disponiveis}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">Em Manutenção</div>
              <div className="text-3xl font-semibold">{em_manutencao}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">Perdidos</div>
              <div className="text-3xl font-semibold">{perdidos}</div>
            </div>
          </div>

          <section>
            <h2 className="text-lg font-medium mb-3">Últimas movimentações</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/80">
                  <tr>
                    <th className="px-4 py-2 text-left text-slate-300">
                      Quando
                    </th>
                    <th className="px-4 py-2 text-left text-slate-300">Ação</th>
                    <th className="px-4 py-2 text-left text-slate-300">
                      Usuário
                    </th>
                    <th className="px-4 py-2 text-left text-slate-300">Item</th>
                    <th className="px-4 py-2 text-left text-slate-300">
                      Disturbance
                    </th>
                    <th className="px-4 py-2 text-left text-slate-300">
                      Quem realizou
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-4 text-center text-slate-500">
                        Nenhum movimento registrado ainda.
                      </td>
                    </tr>
                  )}
                  {movements.map((m) => (
                    <tr
                      key={m.movement_id}
                      className="border-t border-slate-800">
                      <td className="px-4 py-2 text-xs">
                        {new Date(m.captured_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        {m.action === "cautela" ? "Cautela" : "Descautela"}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {m.user_name || "—"}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {m.item_name || "—"}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {m.movement_disturbance || "—"}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {m.logged_user_name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}
