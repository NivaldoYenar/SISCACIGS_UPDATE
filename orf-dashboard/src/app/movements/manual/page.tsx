"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/require-auth";
import { API_BASE, getToken } from "@/lib/auth-client";
import type { ItemStatus } from "@/lib/centralApi";
import { useAuth } from "@/components/auth-provider";
import { Role } from "@/lib/permissions";
import Link from "next/link";

type UserRow = {
  id: string;
  name: string;
  identity_number: string | null;
  om: string | null;
  role: string;
  active: boolean;
  created_at: string;
  posto_graduacao?: string | null;
};

type ManualMovementResponse = {
  ok: boolean;
  results: {
    item_id: string;
    movement_id: string;
    requires_review: boolean;
  }[];
};

type PaginatedItems = {
  items: ItemStatus[];
  total: number;
  page: number;
  page_size: number;
};

type PaginatedUsers = {
  items: UserRow[];
  total: number;
  page: number;
  page_size: number;
};

async function authFetchJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Erro ao chamar API (${resp.status}): ${
        text || resp.statusText || "sem detalhes"
      }`
    );
  }

  return (await resp.json()) as T;
}

export default function ManualMovementsPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? "USER") as Role;

  const canAccessManualMovements =
    userRole === "ADMIN" ||
    userRole === "SCMT_OM" ||
    userRole === "CMT_SU_E_S2";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [items, setItems] = useState<ItemStatus[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [action, setAction] = useState<"cautela" | "descautela">("cautela");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [disturbances, setDisturbances] = useState<Record<string, string>>({});

  const [destination, setDestination] = useState<
    "" | "servico" | "missao" | "outro"
  >("");
  const [observation, setObservation] = useState("");

  const [userSearch, setUserSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  // helper pra carregar usuários e itens com backend paginado
  async function loadUsersAndItems() {
    setError(null);
    try {
      const [usersData, itemsData] = await Promise.all([
        authFetchJson<PaginatedUsers>("/users?page=1&page_size=200"),
        authFetchJson<PaginatedItems>("/items/status?page=1&page_size=200"),
      ]);

      setUsers(usersData.items.filter((u) => u.active));
      setItems(itemsData.items);
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        // se for 403, tratamos como acesso negado
        if (err.message.includes("(403)")) {
          setForbidden(true);
          setError("Você não possui permissão para acessar esta página.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Erro ao carregar usuários e itens.");
      }
    }
  }

  // Carrega usuários e status dos itens
  useEffect(() => {
    void loadUsersAndItems();
  }, []);

  const filteredUsers = useMemo(() => {
    let base = users;
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      base = base.filter((u) => {
        return (
          u.name.toLowerCase().includes(q) ||
          (u.identity_number ?? "").toLowerCase().includes(q) ||
          (u.om ?? "").toLowerCase().includes(q)
        );
      });
    }
    return base;
  }, [users, userSearch]);

  const filteredItems = useMemo(() => {
    let base = items;

    if (action === "cautela") {
      // só itens sem posse atual
      base = base.filter((i) => !i.current_user_id);
      base = base.filter((i) => i.status === "available");
    } else {
      // descautela: só itens na posse do usuário selecionado
      if (selectedUserId) {
        base = base.filter((i) => i.current_user_id === selectedUserId);
      } else {
        base = [];
      }
    }

    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase();
      base = base.filter((i) => {
        return (
          i.item_name.toLowerCase().includes(q) ||
          (i.serial_number ?? "").toLowerCase().includes(q) ||
          (i.asset_number ?? "").toLowerCase().includes(q)
        );
      });
    }

    return base;
  }, [items, action, selectedUserId, itemSearch]);

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleDisturbanceChange = (itemId: string, value: string) => {
    setDisturbances((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedUserId) {
      setError("Selecione um usuário.");
      return;
    }
    if (selectedItemIds.length === 0) {
      setError("Selecione ao menos um item.");
      return;
    }

    if (action === "cautela" && !destination) {
      setError("Selecione o destino do material.");
      return;
    }

    setLoading(true);
    try {
      const body: {
        user_id: string;
        item_ids: string[];
        action: "cautela" | "descautela";
        disturbances?: Record<string, string>;
        destination?: "servico" | "missao" | "outro";
        observation?: string;
      } = {
        user_id: selectedUserId,
        item_ids: selectedItemIds,
        action,
      };

      if (action === "cautela") {
        body.destination = destination as "servico" | "missao" | "outro";
        if (observation.trim()) {
          body.observation = observation.trim();
        }
      }

      if (action === "descautela") {
        const onlyFilled: Record<string, string> = {};
        for (const id of selectedItemIds) {
          const d = disturbances[id];
          if (d && d.trim()) {
            onlyFilled[id] = d.trim();
          }
        }
        if (Object.keys(onlyFilled).length > 0) {
          body.disturbances = onlyFilled;
        }
      }

      const resp = await authFetchJson<ManualMovementResponse>(
        "/manual/movements",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );

      const withReview = resp.results.filter((r) => r.requires_review);

      if (withReview.length > 0) {
        setSuccess(`Movimentação registrada com sucesso.`);
      } else {
        setSuccess("Movimentação registrada com sucesso.");
      }

      // reset básico
      setSelectedItemIds([]);
      setDisturbances({});
      setDestination("");
      setObservation("");

      // recarrega itens para refletir novas posses
      try {
        const itemsData = await authFetchJson<PaginatedItems>(
          "/items/status?page=1&page_size=200"
        );
        setItems(itemsData.items);
      } catch (err) {
        console.error("Erro ao recarregar itens depois da movimentação:", err);
      }
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        // se aqui também rolar 403, marca como acesso negado
        if (err.message.includes("(403)")) {
          setForbidden(true);
          setError("Você não possui permissão para registrar movimentações.");
        } else {
          setError(err.message);
        }
      } else {
        setError(String(err) || "Erro ao registrar movimentação.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canAccessManualMovements) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
          <div className="max-w-2xl mx-auto space-y-4">
            <h1 className="text-2xl font-semibold">Acesso negado</h1>
            <p className="text-slate-400 text-sm">
              Você não possui permissão para acessar esta página.
            </p>
          </div>
        </main>
      </RequireAuth>
    );
  }

  // se backend respondeu 403 em qualquer chamada, mostra só acesso negado
  if (forbidden) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
          <div className="max-w-2xl mx-auto space-y-4">
            <h1 className="text-2xl font-semibold">Acesso negado</h1>
            <p className="text-slate-400 text-sm">
              Você não possui permissão para realizar cautela/descautela manual.
            </p>
            {error && (
              <p className="text-xs text-slate-500">
                Detalhes técnicos: {error}
              </p>
            )}
          </div>
        </main>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <main className="space-y-6">
        <header className="flex flex-col gap-3">
            <div>
              <h1 className="text-2xl font-semibold">
                Cautela / Descautela Manual
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Selecione um usuário e um ou mais itens para abrir ou fechar cautela.
              </p>
            </div>

            <Link
              href="/terminal"
              className="mt-2 w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Terminal (Reconhecimento Facial)
            </Link>
          </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ação */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="cautela"
                checked={action === "cautela"}
                onChange={() => setAction("cautela")}
              />
              Cautela
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="descautela"
                checked={action === "descautela"}
                onChange={() => setAction("descautela")}
              />
              Descautela
            </label>
          </div>

          {/* Destino / Observação (apenas na cautela) */}
          {action === "cautela" && (
            <section className="space-y-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
              <h2 className="text-sm font-medium">Destino do material</h2>
              <p className="text-xs text-slate-400">
                Selecione o destino desta cautela e, se necessário, adicione uma
                observação.
              </p>
              <div className="mt-1 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-4 w-4"
                    value="servico"
                    checked={destination === "servico"}
                    onChange={() => setDestination("servico")}
                  />
                  Serviço
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-4 w-4"
                    value="missao"
                    checked={destination === "missao"}
                    onChange={() => setDestination("missao")}
                  />
                  Missão
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-4 w-4"
                    value="outro"
                    checked={destination === "outro"}
                    onChange={() => setDestination("outro")}
                  />
                  Outro
                </label>
              </div>

              <textarea
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                placeholder="Observação (opcional)..."
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* Usuários */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium">Usuário</h2>
                  <p className="text-xs text-slate-400">
                    Selecione o usuário responsável pela movimentação.
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Buscar usuário..."
                  className="w-64 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>

              <select
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                size={10}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">Selecione um usuário...</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.identity_number ? `- ${u.identity_number}` : ""}{" "}
                    {u.om ? `(${u.om})` : ""}
                  </option>
                ))}
              </select>
            </section>

            {/* Itens */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium">Itens</h2>
                  <p className="text-xs text-slate-400">
                    Marque os itens que deseja{" "}
                    {action === "cautela" ? "cautelar" : "descautelar"}.
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Buscar item..."
                  className="w-64 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>

              <div className="h-80 space-y-1 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-2 text-sm">
                {filteredItems.length === 0 && (
                  <p className="text-xs text-slate-500">
                    Nenhum item encontrado para os filtros atuais.
                  </p>
                )}

                {filteredItems.map((i) => {
                  const selected = selectedItemIds.includes(i.item_id);
                  const disturbanceValue = disturbances[i.item_id] ?? "";

                  return (
                    <div
                      key={i.item_id}
                      className={`space-y-1 rounded-md border px-2 py-1 ${
                        selected
                          ? "border-emerald-500 bg-emerald-950/40"
                          : "border-slate-700 bg-slate-900"
                      }`}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected}
                          onChange={() => toggleItem(i.item_id)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {i.item_name}{" "}
                              {i.serial_number ? `(${i.serial_number})` : ""}
                            </span>
                            {i.item_type_name && (
                              <span className="text-xs text-slate-400">
                                {i.item_type_name}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400">
                            {i.asset_number && (
                              <span>
                                Número de patrimônio: {i.asset_number}
                              </span>
                            )}
                            {i.current_user_name && (
                              <span>
                                Em posse de: {i.current_user_name}
                                {i.current_user_identity_number
                                  ? ` (${i.current_user_identity_number})`
                                  : ""}
                              </span>
                            )}
                            {i.current_destination && (
                              <span>
                                Destino atual:{" "}
                                {i.current_destination === "servico"
                                  ? "Serviço"
                                  : i.current_destination === "missao"
                                  ? "Missão"
                                  : "Outro"}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>

                      {action === "descautela" && selected && (
                        <textarea
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                          placeholder="Distúrbio (opcional, ex: dano, defeito, observação)..."
                          value={disturbanceValue}
                          onChange={(e) =>
                            handleDisturbanceChange(i.item_id, e.target.value)
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Mensagens */}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}

          {/* Ações */}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Registrando..." : "Confirmar movimentação"}
          </button>
        </form>
      </main>
    </RequireAuth>
  );
}
