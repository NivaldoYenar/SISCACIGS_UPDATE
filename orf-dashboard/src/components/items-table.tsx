"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ItemStatus, Item } from "@/lib/centralApi";
import { API_BASE, getToken } from "@/lib/auth-client";
import Select, { type SingleValue, type StylesConfig } from "react-select";
import Link from "next/link";

type ItemsTableProps = {
  // `items` ainda existe para compatibilidade, mas não é mais usado.
  items: ItemStatus[];
  canEdit: boolean;
};

type ItemType = {
  id: string;
  name: string;
  description: string | null;
  category: string; // NOVO
};

type ItemForm = {
  id?: string;
  name: string;
  serial_number: string;
  description: string;
  item_type_id: string;
};

type ItemTypeForm = {
  id?: string;
  name: string;
  description: string;
  category: string; // NOVO
};

type TypeOption = {
  value: string;
  label: string;
};

const selectStyles: StylesConfig<TypeOption, false> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "#020617", // bg-slate-950
    borderColor: state.isFocused ? "#38bdf8" : "#1e293b",
    boxShadow: "none",
    minHeight: "40px",
    "&:hover": {
      borderColor: "#38bdf8",
    },
    cursor: "pointer",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "#020617",
    borderRadius: 8,
    border: "1px solid #1e293b",
    overflow: "hidden",
    zIndex: 50,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#0f766e"
      : state.isFocused
      ? "#1e293b"
      : "transparent",
    color: "#e5e7eb",
    fontSize: "0.875rem",
    cursor: "pointer",
  }),
  singleValue: (base) => ({
    ...base,
    color: "#e5e7eb",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#64748b",
  }),
  input: (base) => ({
    ...base,
    color: "#e5e7eb",
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? "#e5e7eb" : "#9ca3af",
    "&:hover": { color: "#e5e7eb" },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "#9ca3af",
    "&:hover": { color: "#e5e7eb" },
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: "#1f2937",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
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

type PaginatedItems = {
  items: ItemStatus[];
  total: number;
  page: number;
  page_size: number;
};

export function ItemsTable({ canEdit }: ItemsTableProps) {
  // dados e paginação
  const [items, setItems] = useState<ItemStatus[]>([]);
  const [total, setTotal] = useState(0); // total filtrado
  const [totalAll, setTotalAll] = useState<number | null>(null); // total geral
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // tipos de item
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);

  // filtros
  const [search, setSearch] = useState("");
  const [filterTypeId, setFilterTypeId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // modal de item
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [itemNameTouched, setItemNameTouched] = useState(false);

  // modal de tipo
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeForm, setTypeForm] = useState<ItemTypeForm | null>(null);

  // carregar tipos na montagem
  useEffect(() => {
    (async () => {
      try {
        const data = await authFetchJson<ItemType[]>("/item-types");
        setItemTypes(data);
      } catch (err) {
        console.error("Erro ao carregar tipos de item", err);
      }
    })();
  }, []);

  // total geral (sem filtros) – carrega uma vez
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("page_size", "1");
        const data = await authFetchJson<PaginatedItems>(
          `/items/status?${params.toString()}`
        );
        setTotalAll(data.total);
      } catch (err) {
        console.error("Erro ao carregar total geral de itens", err);
      }
    })();
  }, []);

  // carregar itens sempre que filtros / paginação mudarem
  useEffect(() => {
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterTypeId, filterStatus, page, pageSize]);

  async function fetchItems() {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const term = search.trim();
      if (term) params.set("search", term);
      if (filterTypeId) params.set("item_type_id", filterTypeId);
      if (filterStatus) params.set("status", filterStatus);

      const data = await authFetchJson<PaginatedItems>(
        `/items/status?${params.toString()}`
      );

      setItems(data.items);
      setTotal(data.total); // total com filtros
    } catch (err) {
      console.error("Erro ao carregar itens", err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // options para react-select
  const typeOptions: TypeOption[] = useMemo(
    () => itemTypes.map((t) => ({ value: t.id, label: t.name })),
    [itemTypes]
  );

  const filterSelectedOption: TypeOption | null = useMemo(() => {
    if (!filterTypeId) return null;
    return typeOptions.find((opt) => opt.value === filterTypeId) ?? null;
  }, [filterTypeId, typeOptions]);

  const modalTypeId = itemForm?.item_type_id ?? "";
  const modalSelectedOption: TypeOption | null = useMemo(() => {
    if (!modalTypeId) return null;
    return typeOptions.find((opt) => opt.value === modalTypeId) ?? null;
  }, [modalTypeId, typeOptions]);

  // --------- Item handlers ---------

  function openNewItemModal() {
    if (!canEdit) return;
    setItemForm({
      id: undefined,
      name: "",
      serial_number: "",
      description: "",
      item_type_id: "",
    });
    setItemNameTouched(false);
    setItemModalOpen(true);
  }

  function openEditItemModal(item: ItemStatus) {
    if (!canEdit) return;
    setItemForm({
      id: item.item_id,
      name: item.item_name ?? "",
      serial_number: item.serial_number ?? "",
      description: item.description ?? "",
      item_type_id: (item as ItemStatus).item_type_id ?? "",
    });
    setItemNameTouched(false);
    setItemModalOpen(true);
  }

  function closeItemModal() {
    setItemModalOpen(false);
    setItemForm(null);
    setItemNameTouched(false);
  }

  async function handleSaveItem(e: FormEvent) {
    e.preventDefault();
    if (!itemForm) return;

    if (!itemForm.name.trim()) {
      setItemNameTouched(true);
      return;
    }

    try {
      const payload: Partial<Item> = {
        name: itemForm.name.trim(),
        serial_number: itemForm.serial_number.trim() || null,
        description: itemForm.description.trim() || null,
        item_type_id: itemForm.item_type_id || null,
      };

      if (itemForm.id) {
        await authFetchJson<Item>(`/items/${itemForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await authFetchJson<Item>("/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      await fetchItems();
      closeItemModal();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!canEdit) return;
    if (!confirm("Tem certeza que deseja excluir este item?")) return;

    try {
      await authFetchJson<unknown>(`/items/${id}`, {
        method: "DELETE",
      });
      await fetchItems();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  // --------- Tipo handlers ---------

  function openNewTypeModal() {
    if (!canEdit) return;
    setTypeForm({
      id: undefined,
      name: "",
      description: "",
      category: "GERAL", // default
    });
    setTypeModalOpen(true);
  }

  function startEditType(t: ItemType) {
    if (!canEdit) return;
    setTypeForm({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      category: t.category ?? "GERAL",
    });
    setTypeModalOpen(true);
  }

  function closeTypeModal() {
    setTypeModalOpen(false);
    setTypeForm(null);
  }

  async function handleSaveType(e: FormEvent) {
    e.preventDefault();
    if (!typeForm) return;

    try {
      const payload = {
        name: typeForm.name,
        description: typeForm.description || null,
        category: typeForm.category,
      };

      let saved: ItemType;
      if (typeForm.id) {
        saved = await authFetchJson<ItemType>(`/item-types/${typeForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        saved = await authFetchJson<ItemType>("/item-types", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setItemTypes((current) => {
        const exists = current.some((t) => t.id === saved.id);
        if (!exists) {
          return [...current, saved].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
        }
        return current
          .map((t) => (t.id === saved.id ? saved : t))
          .sort((a, b) => a.name.localeCompare(b.name));
      });

      closeTypeModal();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  async function handleChangeStatus(itemId: string, newStatus: string) {
    if (!canEdit) return;
    try {
      await authFetchJson<unknown>(
        `/item-status/${itemId}?status=${newStatus}`,
        {
          method: "PUT",
          // não precisa de body pra esse endpoint
        }
      );

      await fetchItems();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  async function handleDeleteType(id: string) {
    if (!canEdit) return;
    if (
      !confirm(
        "Tem certeza que deseja excluir este tipo? Itens vinculados podem ficar sem tipo."
      )
    ) {
      return;
    }

    try {
      await authFetchJson<unknown>(`/item-types/${id}`, {
        method: "DELETE",
      });
      setItemTypes((current) => current.filter((t) => t.id !== id));
      setFilterTypeId((current) => (current === id ? "" : current));
      await fetchItems();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  // paginação - info derivada
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  // --------- Render ---------

  return (
    <div className="space-y-4">
      {/* Filtros e ações */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="min-w-[220px] flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          placeholder="Buscar por nome, série, tipo, usuário..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />

        {/* filtro de tipo com react-select (busca embutida) */}
        <div className="min-w-[180px]">
          <Select
            className="text-sm"
            classNamePrefix="react-select"
            options={typeOptions}
            value={filterSelectedOption}
            onChange={(option: SingleValue<TypeOption>) => {
              setPage(1);
              setFilterTypeId(option?.value ?? "");
            }}
            placeholder="Todos os tipos"
            isClearable
            isSearchable
            noOptionsMessage={() => "Nenhum tipo encontrado"}
            styles={selectStyles}
          />
        </div>

        {/* filtro de status */}
        <select
          className="w-40 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          value={filterStatus}
          onChange={(e) => {
            setPage(1);
            setFilterStatus(e.target.value);
          }}>
          <option value="">Todos os status</option>
          <option value="available">Disponível</option>
          <option value="checked_out">Emprestado</option>
          <option value="maintenance">Manutenção</option>
          <option value="lost">Perdido</option>
        </select>

        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
              onClick={openNewItemModal}>
              Novo item
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
              onClick={openNewTypeModal}>
              Tipos de item
            </button>
          </div>
        )}
      </div>

      {/* Tabela de itens */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
        {loading && (
          <div className="px-3 py-2 text-xs text-slate-400">
            Carregando itens...
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-xs text-red-300">
            Erro ao carregar itens: {error}
          </div>
        )}

        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Número de série</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Usuário atual</th>
              <th className="px-3 py-2 text-left">Observação</th>
              {canEdit && <th className="px-3 py-2 text-right">Ações</th>}
              {canEdit && (
                <th className="px-3 py-2 text-right">Manutenção / Perda</th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.item_id}
                className="border-b border-slate-900/80 hover:bg-slate-900/60">
                <td className="px-3 py-2 align-top">
                  <Link
                    href={`/items/${item.item_id}`}
                    className="flex flex-col gap-0.5 group">
                    <div className="text-sm font-medium text-slate-100 group-hover:underline">
                      {item.item_name}
                    </div>
                    {item.description && (
                      <div className="text-xs text-slate-400">
                        {item.description}
                      </div>
                    )}
                  </Link>
                </td>

                <td className="px-3 py-2 align-top text-xs text-slate-300">
                  {item.serial_number || "-"}
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-300">
                  {(item as ItemStatus).item_type_name || "-"}
                </td>
                <td className="px-3 py-2 align-top text-xs">
                  <span
                    className={
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      (item.status === "available"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : item.status === "checked_out"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-slate-500/20 text-slate-200")
                    }>
                    {item.status}
                  </span>
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-300">
                  <div className="text-sm font-medium text-slate-100 group-hover:underline">
                    {item.current_user_name || "—"}
                  </div>
                  {item.current_destination && (
                    <div className="text-xs text-slate-400">
                      {item.current_destination}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-300">
                  {item.current_observation || "—"}
                </td>
                {canEdit && (
                  <td className="px-3 py-2 align-top text-right text-xs">
                    <button
                      type="button"
                      className="mr-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                      onClick={() => openEditItemModal(item)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-red-700 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/60"
                      onClick={() => handleDeleteItem(item.item_id)}>
                      Excluir
                    </button>
                  </td>
                )}
                {canEdit && (
                  <td className="px-3 py-2 align-top text-right text-xs">
                    {item.status == "available" ||
                    item.status == "checked_out" ? (
                      <div>
                        <button
                          type="button"
                          className="mr-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                          onClick={() =>
                            handleChangeStatus(item.item_id, "maintenance")
                          }>
                          Manutenção
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-700 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/60"
                          onClick={() =>
                            handleChangeStatus(item.item_id, "lost")
                          }>
                          Perdido
                        </button>
                      </div>
                    ) : (
                      <div>
                        <button
                          type="button"
                          className="mr-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                          onClick={() =>
                            handleChangeStatus(
                              item.item_id,
                              item.current_user_id ? "checked_out" : "available"
                            )
                          }>
                          Disponível
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={canEdit ? 6 : 5}
                  className="px-3 py-6 text-center text-xs text-slate-500">
                  {totalAll && totalAll > 0
                    ? "Nenhum item encontrado com os filtros atuais."
                    : "Nenhum item encontrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de paginação + resumo de totais */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div>
          {totalAll != null && (
            <div className="mb-1">
              <span className="mr-3">
                Total cadastrados:{" "}
                <span className="text-slate-100">{totalAll}</span>
              </span>
              <span>
                Total filtrado: <span className="text-slate-100">{total}</span>
              </span>
            </div>
          )}

          {total > 0 ? (
            <div>
              Mostrando <span className="text-slate-100">{from}</span> –{" "}
              <span className="text-slate-100">{to}</span> de{" "}
              <span className="text-slate-100">{total}</span> itens
            </div>
          ) : (
            <div>
              {totalAll && totalAll > 0
                ? "Nenhum item com esses filtros"
                : "Nenhum item para exibir"}
            </div>
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
              setPageSize(Number(e.target.value) || 20);
            }}>
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / página
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Modal de Item */}
      {itemModalOpen && itemForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950 p-4">
            <h2 className="mb-4 text-sm font-semibold text-slate-100">
              {itemForm.id ? "Editar item" : "Novo item"}
            </h2>

            <form className="space-y-3" onSubmit={handleSaveItem}>
              {/* Tipo com react-select */}
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Tipo
                </label>
                <Select
                  className="text-sm"
                  classNamePrefix="react-select"
                  options={typeOptions}
                  value={modalSelectedOption}
                  onChange={(option: SingleValue<TypeOption>) => {
                    setItemForm((prev) => {
                      if (!prev) return prev;
                      const shouldOverwriteName =
                        !itemNameTouched || !prev.name.trim();
                      return {
                        ...prev,
                        item_type_id: option?.value ?? "",
                        name:
                          shouldOverwriteName && option
                            ? option.label
                            : prev.name,
                      };
                    });
                  }}
                  placeholder="Selecione um tipo"
                  isClearable
                  isSearchable
                  noOptionsMessage={() => "Nenhum tipo encontrado"}
                  styles={selectStyles}
                />
              </div>

              {/* Nome do item */}
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Nome
                </label>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                  value={itemForm.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setItemForm((prev) =>
                      prev ? { ...prev, name: value } : prev
                    );
                    setItemNameTouched(true);
                  }}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Número de série
                </label>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                  value={itemForm.serial_number}
                  onChange={(e) =>
                    setItemForm((prev) =>
                      prev ? { ...prev, serial_number: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Descrição
                </label>
                <textarea
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                  rows={3}
                  value={itemForm.description}
                  onChange={(e) =>
                    setItemForm((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                  onClick={closeItemModal}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Tipo */}
      {/* {typeModalOpen && typeForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-4">
            <h2 className="mb-4 text-sm font-semibold text-slate-100">
              {typeForm.id ? "Editar tipo de item" : "Novo tipo de item"}
            </h2>

            <form className="space-y-3" onSubmit={handleSaveType}>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Nome
                </label>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                  value={typeForm.name}
                  onChange={(e) =>
                    setTypeForm((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev
                    )
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Descrição
                </label>
                <textarea
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                  rows={3}
                  value={typeForm.description}
                  onChange={(e) =>
                    setTypeForm((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Categoria
                </label>
                <select
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                  value={typeForm.category}
                  onChange={(e) =>
                    setTypeForm((prev) =>
                      prev ? { ...prev, category: e.target.value } : prev
                    )
                  }
                  required>
                  <option value="GERAL">GERAL</option>
                  <option value="OPTRONICO">OPTRONICO</option>
                  <option value="FARTICULAR">FARTICULAR</option>
                  <option value="FORA_DA_CARGA">FORA_DA_CARGA</option>
                  <option value="OUTRO">OUTRO</option>
                </select>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                  onClick={closeTypeModal}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )} */}
      {/* Modal de Tipo / Gerenciador de tipos */}
      {typeModalOpen && typeForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Gerenciar tipos de item
              </h2>

              <button
                type="button"
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                onClick={() =>
                  setTypeForm({
                    id: undefined,
                    name: "",
                    description: "",
                    category: "GERAL",
                  })
                }>
                Novo tipo
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[2fr,1.4fr]">
              {/* Lista de tipos */}
              <div className="max-h-[380px] overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40">
                {itemTypes.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-500">
                    Nenhum tipo cadastrado.
                  </div>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2 text-left">Nome</th>
                        <th className="px-3 py-2 text-left">Categoria</th>
                        <th className="px-3 py-2 text-left">Descrição</th>
                        <th className="px-3 py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemTypes.map((t) => (
                        <tr
                          key={t.id}
                          className={
                            "border-b border-slate-900/60 hover:bg-slate-900/70" +
                            (typeForm.id === t.id ? " bg-slate-900/80" : "")
                          }>
                          <td className="px-3 py-2 align-top text-[13px] text-slate-100">
                            {t.name}
                          </td>
                          <td className="px-3 py-2 align-top text-[11px]">
                            <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-200">
                              {t.category}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top text-[11px] text-slate-400">
                            {t.description || "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-right text-[11px]">
                            <button
                              type="button"
                              className="mr-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                              onClick={() => startEditType(t)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-red-700 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/60"
                              onClick={() => handleDeleteType(t.id)}>
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Formulário de tipo (criação/edição) */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h3 className="mb-3 text-xs font-semibold text-slate-200">
                  {typeForm.id ? "Editar tipo" : "Novo tipo"}
                </h3>

                <form className="space-y-3" onSubmit={handleSaveType}>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      Nome
                    </label>
                    <input
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                      value={typeForm.name}
                      onChange={(e) =>
                        setTypeForm((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev
                        )
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      Descrição
                    </label>
                    <textarea
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                      rows={3}
                      value={typeForm.description}
                      onChange={(e) =>
                        setTypeForm((prev) =>
                          prev ? { ...prev, description: e.target.value } : prev
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      Categoria
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                      value={typeForm.category}
                      onChange={(e) =>
                        setTypeForm((prev) =>
                          prev ? { ...prev, category: e.target.value } : prev
                        )
                      }
                      required>
                      <option value="GERAL">GERAL</option>
                      <option value="OPTRONICO">OPTRONICO</option>
                      <option value="PARTICULAR">PARTICULAR</option>
                      <option value="FORA_DA_CARGA">FORA_DA_CARGA</option>
                      <option value="OUTRO">OUTRO</option>
                    </select>
                  </div>

                  <div className="mt-4 flex justify-between gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                      onClick={closeTypeModal}>
                      Fechar
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">
                      {typeForm.id ? "Salvar alterações" : "Criar tipo"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
