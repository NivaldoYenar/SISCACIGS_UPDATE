"use client";

import { useEffect, useState } from "react";
import type { MovementLog } from "@/lib/centralApi";
import { API_BASE, getToken } from "@/lib/auth-client";

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

type MovementsTableProps = {
  // Mantido por compatibilidade, mas não é mais usado.
  movements: MovementLog[];
};

type PaginatedMovements = {
  items: MovementLog[];
  total: number;
  page: number;
  page_size: number;
};

async function authFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new Error("Token de autenticação não encontrado");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro na requisição (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export function MovementsTable({
  movements: _initialMovements,
}: MovementsTableProps) {
  const [items, setItems] = useState<MovementLog[]>([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<
    "all" | "cautela" | "descautela"
  >("all");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, actionFilter, page, pageSize]);

  async function fetchMovements() {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const term = search.trim();
      if (term) params.set("search", term);
      if (actionFilter !== "all") params.set("action", actionFilter);

      const data = await authFetchJson<PaginatedMovements>(
        `/movements?${params.toString()}`
      );

      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error("Erro ao carregar movimentações", err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  return (
    <>
      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="min-w-[220px] flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          placeholder="Buscar por usuário, identidade, item, série, kiosk..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />

        <select
          className="w-40 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          value={actionFilter}
          onChange={(e) => {
            setPage(1);
            setActionFilter(e.target.value as "all" | "cautela" | "descautela");
          }}>
          <option value="all">Todas as ações</option>
          <option value="cautela">Cautela</option>
          <option value="descautela">Descautela</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
        {loading && (
          <div className="px-4 py-2 text-xs text-slate-400">
            Carregando movimentações...
          </div>
        )}
        {error && (
          <div className="px-4 py-2 text-xs text-red-300">
            Erro ao carregar movimentações: {error}
          </div>
        )}

        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/80">
            <tr>
              <th className="px-4 py-2 text-left text-slate-300">Quando</th>
              <th className="px-4 py-2 text-left text-slate-300">Ação</th>
              <th className="px-4 py-2 text-left text-slate-300">Usuário</th>
              <th className="px-4 py-2 text-left text-slate-300">Item</th>
              <th className="px-4 py-2 text-left text-slate-300">Alteração</th>
              <th className="px-4 py-2 text-left text-slate-300">
                Quem realizou
              </th>
              {/* <th className="px-4 py-2 text-left text-slate-300">Kiosk</th> */}
              {/* <th className="px-4 py-2 text-left text-slate-300">Confiança</th>
              <th className="px-4 py-2 text-left text-slate-300">Revisão?</th> */}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-4 text-center text-slate-500">
                  Nenhuma movimentação encontrada.
                </td>
              </tr>
            )}

            {items.map((m) => (
              <tr
                key={m.movement_id}
                className="border-t border-slate-800 hover:bg-slate-800/40">
                <td className="px-4 py-2 text-xs">
                  {new Date(m.captured_at).toLocaleString()}
                </td>

                <td className="px-4 py-2 text-xs">
                  <span
                    className={
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      (m.action === "cautela"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : m.action === "descautela"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-slate-500/20 text-slate-200")
                    }>
                    {actionLabel(m.action)}
                  </span>
                </td>

                <td className="px-4 py-2 text-sm">
                  {m.user_name || "—"}
                  {m.user_identity_number && (
                    <div className="text-[11px] text-slate-500">
                      {m.user_identity_number}
                    </div>
                  )}
                </td>

                <td className="px-4 py-2 text-sm">
                  {m.item_name || "—"}
                  {m.item_serial_number && (
                    <div className="text-[11px] text-slate-500">
                      {m.item_serial_number}
                    </div>
                  )}
                </td>

                <td className="px-4 py-2 text-sm">
                  {m.movement_disturbance || "—"}
                </td>

                <td className="px-4 py-2 text-sm">
                  {m.logged_user_name || "—"}
                </td>

                {/* <td className="px-4 py-2 text-sm">
                  {m.kiosk_name || "—"}
                  {m.kiosk_code && (
                    <div className="text-[11px] text-slate-500">
                      {m.kiosk_code}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {m.confidence != null
                    ? `${(m.confidence * 100).toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-xs">
                  {m.requires_review ? "Sim" : "Não"}
                </td> */}
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
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-slate-700 px-2 py-1 disabled:opacity-50">
            Anterior
          </button>
          <span>
            Página <span className="text-slate-100">{page}</span> de{" "}
            <span className="text-slate-100">{totalPages}</span>
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-700 px-2 py-1 disabled:opacity-50">
            Próxima
          </button>

          <select
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value) || 50);
            }}>
            {[20, 50, 100, 200].map((size) => (
              <option key={size} value={size}>
                {size} / página
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
