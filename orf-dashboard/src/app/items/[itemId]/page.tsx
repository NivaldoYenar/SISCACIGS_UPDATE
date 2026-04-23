import Link from "next/link";
import { RequireAuth } from "@/components/require-auth";
import {
  fetchItemStatusById,
  fetchItemMovementsPaginated,
} from "@/lib/centralApi";

export const dynamic = "force-dynamic";

interface ItemPageProps {
  params: {
    itemId?: string;
  };
  searchParams?: {
    page?: string;
    pageSize?: string;
  };
}

function actionLabel(action: string) {
  switch (action) {
    case "cautela":
      return "Cautela";
    case "descautela":
      return "Descautela";
    default:
      return action;
  }
}

export default async function ItemDetailPage({
  params,
  searchParams,
}: ItemPageProps) {
  const itemId = (await params).itemId ?? "";

  if (!itemId) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Item não encontrado</h1>
        <p className="text-slate-400 text-sm">Nenhum item com ID informado.</p>
      </main>
    );
  }

  const page = Number((await searchParams)?.page ?? "1");
  const pageSize = Number((await searchParams)?.pageSize ?? "20");

  const [item, movementsPage] = await Promise.all([
    fetchItemStatusById(itemId),
    fetchItemMovementsPaginated(itemId, page, pageSize),
  ]);

  if (!item) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Item não encontrado</h1>
        <p className="text-slate-400 text-sm">
          Nenhum item com ID <code className="text-slate-200">{itemId}</code>.
        </p>
      </main>
    );
  }

  const movements = movementsPage.items;
  const total = movementsPage.total ?? 0;
  const currentPage = movementsPage.page ?? page;
  const currentPageSize = movementsPage.page_size ?? pageSize;

  const from = total === 0 ? 0 : (currentPage - 1) * currentPageSize + 1;
  const to = Math.min(currentPage * currentPageSize, total);
  const totalPages = total === 0 ? 1 : Math.ceil(total / currentPageSize);

  const emprestado = item.status === "checked_out";

  const buildPageHref = (targetPage: number) => ({
    pathname: `/items/${itemId}`,
    query:
      targetPage === 1 && currentPageSize === 20
        ? undefined
        : {
            ...(targetPage !== 1 && { page: targetPage }),
            ...(currentPageSize !== 20 && {
              pageSize: currentPageSize,
            }),
          },
  });

  return (
    <RequireAuth>
      <main className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{item.item_name}</h1>

            {item.serial_number && (
              <p className="text-sm text-slate-400">SN: {item.serial_number}</p>
            )}

            {item.description && (
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            )}

            {item.disturbance != null && (
              <p className="mt-1 text-xs text-slate-400">
                Disturbance: {item.disturbance}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm min-w-[180px]">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
              Status atual
            </div>
            <div className="mb-2">
              <span
                className={
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
                  (emprestado
                    ? "bg-amber-500/15 text-amber-300"
                    : item.status === "available"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-slate-500/20 text-slate-200")
                }>
                {emprestado
                  ? "Emprestado"
                  : item.status === "available"
                  ? "Disponível"
                  : item.status}
              </span>
            </div>

            {emprestado && item.current_user_name && (
              <div className="space-y-1 text-xs">
                <div className="text-slate-400">Com</div>
                <div className="font-medium text-slate-100">
                  {item.current_user_name}
                </div>
                <div className="text-[11px] text-slate-500">
                  {item.current_user_identity_number}
                </div>

                {item.since_timestamp && (
                  <div className="mt-2 text-[11px] text-slate-400">
                    Desde {new Date(item.since_timestamp).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {!emprestado && (
              <p className="mt-2 text-xs text-slate-400">
                Item disponível no estoque.
              </p>
            )}
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Histórico de movimentações</h2>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-300">Quando</th>
                  <th className="px-4 py-2 text-left text-slate-300">Ação</th>
                  <th className="px-4 py-2 text-left text-slate-300">
                    Usuário
                  </th>
                  <th className="px-4 py-2 text-left text-slate-300">
                    Alteração
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
                      colSpan={4}
                      className="px-4 py-4 text-center text-slate-500">
                      Nenhuma movimentação registrada para este item.
                    </td>
                  </tr>
                )}

                {movements.map((m) => (
                  <tr
                    key={m.movement_id}
                    className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-2 text-xs">
                      {new Date(m.captured_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{actionLabel(m.action)}</td>
                    <td className="px-4 py-2 text-sm">
                      {m.user_name || "—"}
                      {m.user_identity_number && (
                        <div className="text-[11px] text-slate-500">
                          {m.user_identity_number}
                        </div>
                      )}
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

          {/* Paginação */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              {total > 0 ? (
                <>
                  Mostrando <span className="text-slate-100">{from}</span> –{" "}
                  <span className="text-slate-100">{to}</span> de{" "}
                  <span className="text-slate-100">{total}</span> movimentações
                </>
              ) : (
                "Nenhuma movimentação para exibir"
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={buildPageHref(currentPage - 1)}
                  className="rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800">
                  Anterior
                </Link>
              ) : (
                <span className="rounded-md border border-slate-800 px-2 py-1 opacity-50">
                  Anterior
                </span>
              )}

              <span>
                Página <span className="text-slate-100">{currentPage}</span> de{" "}
                <span className="text-slate-100">{totalPages}</span>
              </span>

              {currentPage < totalPages ? (
                <Link
                  href={buildPageHref(currentPage + 1)}
                  className="rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800">
                  Próxima
                </Link>
              ) : (
                <span className="rounded-md border border-slate-800 px-2 py-1 opacity-50">
                  Próxima
                </span>
              )}

              {/* Select apenas informativo, sem event handler */}
              <select
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
                value={currentPageSize}
                disabled>
                <option value={10}>10 / página</option>
                <option value={20}>20 / página</option>
                <option value={50}>50 / página</option>
                <option value={100}>100 / página</option>
              </select>
            </div>
          </div>
        </section>
      </main>
    </RequireAuth>
  );
}
