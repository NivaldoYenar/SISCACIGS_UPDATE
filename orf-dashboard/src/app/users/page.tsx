"use client";

import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { API_BASE, getToken } from "@/lib/auth-client";
import { RequireAuth } from "@/components/require-auth";
import { useEffect, useRef, useState } from "react";
import { canAccessPage, canEditPage, type Role } from "@/lib/permissions";
import Link from "next/link"; // <--- ADD

type UserRow = {
  id: string;
  name: string;
  identity_number: string | null;
  om: string | null;
  role: Role;
  active: boolean;
  created_at: string;
  posto_graduacao?: string;
  observation?: string | null;
};

type FormState = {
  id?: string;
  name: string;
  identity_number: string;
  om: string;
  role: Role;
  password: string;
  active: boolean;
  posto_graduacao?: string;
  observation: string;
};

type Posto =
  | "General de Exército"
  | "General de Divisão"
  | "General de Brigada"
  | "Coronel"
  | "Tenente-Coronel"
  | "Major"
  | "Capitão"
  | "1º Tenente"
  | "2º Tenente"
  | "Aspirante a Oficial"
  | "Cadete"
  | "Subtenente"
  | "1º Sargento"
  | "2º Sargento"
  | "3º Sargento"
  | "Cabo"
  | "Taifeiro-mor"
  | "Taifeiro 1ª Classe"
  | "Taifeiro 2ª Classe"
  | "Soldado";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "USER", label: "USER (sem acesso)" },
  { value: "ADMIN", label: "ADMIN (acesso total)" },
  { value: "SCMT_OM", label: "SCMT OM" },
  { value: "CMT_SU_E_S2", label: "CMT SU e S2" },
  { value: "STI_OM", label: "STI OM" },
  { value: "ARMEIRO", label: "ARMEIRO" },
];

const POSTO_OPTIONS: Posto[] = [
  "General de Exército",
  "General de Divisão",
  "General de Brigada",
  "Coronel",
  "Tenente-Coronel",
  "Major",
  "Capitão",
  "1º Tenente",
  "2º Tenente",
  "Aspirante a Oficial",
  "Cadete",
  "Subtenente",
  "1º Sargento",
  "2º Sargento",
  "3º Sargento",
  "Cabo",
  "Taifeiro-mor",
  "Taifeiro 1ª Classe",
  "Taifeiro 2ª Classe",
  "Soldado",
];

type UsersListResponse = {
  items: UserRow[];
  total: number;
  page: number;
  page_size: number;
};

export default function UsersPage() {
  return (
    <RequireAuth>
      <UsersContent />
    </RequireAuth>
  );
}

type UploadPhotoSectionProps = {
  onFileSelected: (file: File | null) => void;
};

function UploadPhotoSection({ onFileSelected }: UploadPhotoSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleClick() {
    inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    onFileSelected(file);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-600/20 text-sky-400 text-xs">
          📎
        </span>
        <span>Selecionar ficheiro</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <p className="text-[11px] text-slate-500">
        Formatos suportados: JPG, PNG. Tamanho máximo: ~5MB.
      </p>
    </div>
  );
}

function UsersContent() {
  const { user } = useAuth();

  // dados
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);

  // paginação
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // estado geral
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // edição
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  // foto
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState<"upload" | "camera">("upload");

  // câmera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // filtros
  const [searchTerm, setSearchTerm] = useState(""); // usado na query
  const [searchDraft, setSearchDraft] = useState(""); // o que o usuário está digitando
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "true" | "false">(
    "ALL"
  );

  const userRole = user?.role as Role | undefined;
  const canAccessUsers = userRole ? canAccessPage(userRole, "users") : false;
  const canEditUsers = userRole ? canEditPage(userRole, "users") : false;
  const canAccessBulkImport =
    userRole === "ADMIN" ||
    userRole === "SCMT_OM" ||
    userRole === "CMT_SU_E_S2" ||
    userRole === "STI_OM";

  // file -> preview
  function handleFileChange(file: File | null) {
    setPhotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  }

  // câmera
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      streamRef.current = stream;
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      alert("Não foi possível acessar a câmera.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function handleCaptureFrame() {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
    );

    if (!blob) return;

    const file = new File([blob], "captured.jpg", { type: "image/jpeg" });
    handleFileChange(file);
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // carregar usuários com filtros + paginação
  useEffect(() => {
    if (!user) return;

    if (!canAccessUsers) {
      setError("Você não tem permissão para acessar esta página.");
      setLoading(false);
      return;
    }

    void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    canAccessUsers,
    searchTerm,
    roleFilter,
    statusFilter,
    page,
    pageSize,
  ]);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const term = searchTerm.trim();
      if (term) params.set("search", term);
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (statusFilter === "true") params.set("active", "true");
      if (statusFilter === "false") params.set("active", "false");

      const res = await fetch(`${API_BASE}/users?${params.toString()}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Erro ao listar usuários");
      }

      const data = (await res.json()) as UsersListResponse;
      setUsers(data.items);
      setTotal(data.total);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Erro ao listar usuários";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    if (!canEditUsers) return;
    setEditing({
      name: "",
      identity_number: "",
      om: "",
      role: "USER",
      password: "",
      active: true,
      posto_graduacao: "",
      observation: "",
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoMode("upload");
  }

  function openEdit(u: UserRow) {
    if (!canEditUsers) return;
    setEditing({
      id: u.id,
      name: u.name,
      identity_number: u.identity_number ?? "",
      om: u.om ?? "",
      role: u.role,
      password: "",
      active: u.active,
      posto_graduacao: u.posto_graduacao || "",
      observation: u.observation ?? "",
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoMode("upload");
  }

  async function handleDelete(id: string) {
    if (!canEditUsers) return;
    if (!confirm("Tem certeza que deseja apagar este usuário?")) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Erro ao apagar usuário");
      }
      // recarrega página atual
      await fetchUsers();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Erro ao apagar usuário";
      alert(msg);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !canEditUsers) return;
    if (saving) return;
    setSaving(true);

    try {
      const token = getToken();
      const isNew = !editing.id;

      const payload: {
        name: string;
        identity_number: string | null;
        om: string | null;
        observation: string | null;
        role: Role;
        password?: string;
        active?: boolean;
        posto_graduacao?: string | null;
      } = {
        name: editing.name,
        identity_number: editing.identity_number || null,
        om: editing.om || null,
        observation: editing.observation || null,
        role: editing.role,
        posto_graduacao: editing.posto_graduacao || null,
      };

      if (isNew || editing.password) {
        payload.password = editing.password;
      }
      if (!isNew) {
        payload.active = editing.active;
      }

      const res = await fetch(
        `${API_BASE}/users${isNew ? "" : `/${editing.id}`}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Erro ao salvar usuário");
      }

      let userId = editing.id;
      if (isNew) {
        const created = await res.json();
        userId = created.id;
      }

      if (photoFile && userId) {
        const fd = new FormData();
        fd.append("file", photoFile);

        const photoRes = await fetch(
          `${API_BASE}/users/${userId}/profile-photo`,
          {
            method: "POST",
            headers: {
              Authorization: token ? `Bearer ${token}` : "",
            },
            body: fd,
          }
        );

        if (!photoRes.ok) {
          const err = await photoRes.json().catch(() => ({}));
          console.error("Erro ao enviar foto:", err);
        }
      }

      setEditing(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoMode("upload");
      await fetchUsers();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Erro ao salvar usuário";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  // ação explícita pra aplicar filtros de busca
  function applySearch() {
    setPage(1);
    setSearchTerm(searchDraft);
  }

  if (user && !canAccessUsers) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Gerenciar usuários</h1>
        <p className="text-sm text-red-300">
          Você não tem permissão para acessar esta página.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gerenciar usuários</h1>

        <div className="flex gap-2">
          {canAccessBulkImport && (
            <Link
              href="/users/bulk-import"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500">
              Importar usuários (CSV)
            </Link>
          )}

          {canEditUsers && (
            <button
              onClick={openCreate}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">
              Adicionar usuário
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Carregando usuários...</p>
      ) : (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-400">
                Buscar (nome, identidade, OM, P/G, role...)
              </label>
              <input
                value={searchDraft}
                onChange={(e) => {
                  setSearchDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applySearch();
                  }
                }}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                placeholder="Digite e pressione Enter ou clique em Buscar..."
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => {
                  setPage(1);
                  setRoleFilter(e.target.value as Role | "ALL");
                }}
                className="mt-1 w-40 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm">
                <option value="ALL">Todas</option>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setPage(1);
                  setStatusFilter(e.target.value as "ALL" | "true" | "false");
                }}
                className="mt-1 w-32 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm">
                <option value="ALL">Todos</option>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </div>

            <button
              type="button"
              onClick={applySearch}
              className="mb-1 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700">
              Buscar
            </button>
          </div>

          {/* Tabela */}
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-300">
                    Posto/Grad
                  </th>
                  <th className="px-4 py-2 text-left text-slate-300">Nome</th>
                  <th className="px-4 py-2 text-left text-slate-300">
                    Identidade / OM
                  </th>
                  <th className="px-4 py-2 text-left text-slate-300">Role</th>
                  <th className="px-4 py-2 text-left text-slate-300">Status</th>
                  <th className="px-4 py-2 text-left text-slate-300">
                    Criado em
                  </th>
                  {canEditUsers && (
                    <th className="px-4 py-2 text-left text-slate-300">
                      Ações
                    </th>
                  )}
                  <th className="px-4 py-2 text-left text-slate-300">Foto</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEditUsers ? 7 : 6}
                      className="px-4 py-4 text-center text-slate-500">
                      {total === 0
                        ? "Nenhum usuário cadastrado."
                        : "Nenhum usuário encontrado com os filtros atuais."}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t border-slate-800 hover:bg-slate-800/40">
                      <td className="px-4 py-2 text-xs">
                        {u.posto_graduacao ? (
                          <span>{u.posto_graduacao}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{u.name}</div>
                        {/* <div className="text-[11px] text-slate-500">{u.id}</div> */}
                        {u.observation && (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {u.observation}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {u.identity_number ? (
                          <>
                            <div>Identidade: {u.identity_number}</div>
                            {u.om && <div>OM: {u.om}</div>}
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">{u.role}</td>
                      <td className="px-4 py-2 text-xs">
                        {u.active ? "Ativo" : "Inativo"}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {new Date(u.created_at).toLocaleString()}
                      </td>

                      {canEditUsers && (
                        <td className="px-4 py-2 text-xs">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEdit(u)}
                              className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-700">
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="rounded border border-red-600 px-2 py-1 text-red-300 hover:bg-red-900/40">
                              Apagar
                            </button>
                          </div>
                        </td>
                      )}

                      <td className="px-4 py-2">
                        <Image
                          src={`/api/user-photo/${u.id}`}
                          alt={u.name}
                          width={32}
                          height={32}
                          className="rounded-full object-cover"
                          unoptimized
                        />
                      </td>
                    </tr>
                  ))
                )}
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
                  <span className="text-slate-100">{total}</span> usuários
                </>
              ) : (
                "Nenhum usuário para exibir"
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
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1"
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
        </>
      )}

      {/* Modal de edição/criação */}
      {editing && canEditUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2 className="mb-3 text-lg font-semibold">
              {editing.id ? "Editar usuário" : "Novo usuário"}
            </h2>

            <div className="px-1 pb-1 pt-1 overflow-y-auto max-h-[80vh]">
              <form onSubmit={handleSave} className="space-y-3 text-sm">
                <div>
                  <label className="block text-slate-300">Nome</label>
                  <input
                    value={editing.name}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, name: e.target.value } : prev
                      )
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-slate-300">Identidade</label>
                    <input
                      value={editing.identity_number}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? { ...prev, identity_number: e.target.value }
                            : prev
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-slate-300">OM</label>
                    <input
                      value={editing.om}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev ? { ...prev, om: e.target.value } : prev
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-slate-300">P/G</label>
                    <select
                      value={editing.posto_graduacao}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? {
                                ...prev,
                                posto_graduacao: e.target.value as Posto,
                              }
                            : prev
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1">
                      <option value="">Selecione</option>
                      {POSTO_OPTIONS.map((opt: Posto) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300">Observação</label>
                  <textarea
                    value={editing.observation}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, observation: e.target.value } : prev
                      )
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs min-h-[60px]"
                    placeholder="Observações internas sobre este usuário (opcional)"
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-slate-300">Role</label>
                    <select
                      value={editing.role}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? {
                                ...prev,
                                role: e.target.value as Role,
                              }
                            : prev
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1">
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editing.id && (
                    <div className="flex-1">
                      <label className="block text-slate-300">Status</label>
                      <select
                        value={editing.active ? "true" : "false"}
                        onChange={(e) =>
                          setEditing((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  active: e.target.value === "true",
                                }
                              : prev
                          )
                        }
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1">
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300">
                    Senha {editing.id && "(deixe em branco para não alterar)"}
                  </label>
                  <input
                    type="password"
                    value={editing.password}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, password: e.target.value } : prev
                      )
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1"
                    {...(!editing.id && { required: true })}
                  />
                </div>

                <div>
                  <label className="block text-slate-300">Foto de perfil</label>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Foto de perfil
                    </h3>
                    <p className="text-xs text-slate-400">
                      Use uma foto nítida de frente. Ela será usada para o
                      reconhecimento facial.
                    </p>

                    <div className="inline-flex rounded-lg bg-slate-800/60 p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoMode("upload");
                          stopCamera();
                        }}
                        className={`px-3 py-1 rounded-md ${
                          photoMode === "upload"
                            ? "bg-sky-600 text-white"
                            : "text-slate-300 hover:bg-slate-700/60"
                        }`}>
                        Carregar ficheiro
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setPhotoMode("camera");
                          await startCamera();
                        }}
                        className={`ml-1 px-3 py-1 rounded-md ${
                          photoMode === "camera"
                            ? "bg-sky-600 text-white"
                            : "text-slate-300 hover:bg-slate-700/60"
                        }`}>
                        Tirar foto
                      </button>
                    </div>

                    {photoMode === "upload" && (
                      <UploadPhotoSection onFileSelected={handleFileChange} />
                    )}

                    {photoMode === "camera" && (
                      <div className="space-y-2">
                        <div className="w-full max-w-md overflow-hidden rounded-lg bg-black/60 mx-auto">
                          <video
                            ref={videoRef}
                            className="h-56 w-full object-cover"
                            playsInline
                            muted
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleCaptureFrame}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                          Capturar foto
                        </button>
                      </div>
                    )}

                    {photoPreview && (
                      <div className="mt-2 flex items-center gap-3">
                        <Image
                          src={photoPreview}
                          alt="Pré-visualização da foto"
                          width={64}
                          height={64}
                          className="h-16 w-16 rounded-full object-cover border border-slate-700"
                          unoptimized
                        />
                        <button
                          type="button"
                          onClick={() => handleFileChange(null)}
                          className="text-xs text-rose-400 hover:underline">
                          Remover foto
                        </button>
                      </div>
                    )}
                  </section>

                  <p className="mt-1 text-[11px] text-slate-500">
                    JPG ou PNG. Ao salvar, a foto será usada para o
                    reconhecimento facial.
                  </p>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setPhotoMode("upload");
                      setPhotoPreview(null);
                      setPhotoFile(null);
                      setEditing(null);
                    }}
                    className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500">
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
