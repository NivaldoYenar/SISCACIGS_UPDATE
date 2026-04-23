"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/components/auth-provider";
import { API_BASE, getToken } from "@/lib/auth-client";
import { canEditPage, type Role } from "@/lib/permissions";

type BulkRowDraft = {
  identity_number: string;
  name: string;
  om: string;
  posto_graduacao: string;
  role: string;
  active: string;
  observation: string;
  profile_photo_url: string;
};

type ImportResult = {
  identity_number: string;
  status: "created" | "updated" | "reactivated" | "skipped" | "error";
  message?: string;
};

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result.map((s) => s.trim());
}

function parseCsvForms(text: string): BulkRowDraft[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const header = splitCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);

  const getField = (cols: string[], name: string): string => {
    const position = idx(name);
    if (position === -1) return "";
    return (cols[position] ?? "").trim();
  };

  const rows: BulkRowDraft[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length) continue;

    const identity_number = getField(
      cols,
      "Número de Identidade (identity_number)"
    );
    const name = getField(cols, "Nome Completo");
    if (!identity_number && !name) continue;

    rows.push({
      identity_number,
      name,
      om: getField(cols, "Organização Militar (OM)"),
      posto_graduacao: getField(cols, "Posto/Graduação"),
      role: getField(cols, "Função/Cargo (role)") || "USER",
      active: getField(cols, "Status do Perfil") || "Ativo",
      observation: getField(cols, "Observações Adicionais"),
      profile_photo_url: getField(cols, "Foto de Perfil"),
    });
  }

  return rows;
}

function BulkUsersImportContent() {
  const { user } = useAuth();
  const userRole = (user?.role ?? "USER") as Role;
  const canEditUsers = canEditPage(userRole, "users");

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRowDraft[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResults(null);
    setParsingError(null);
    setRows([]);

    if (!file) {
      setFileName(null);
      return;
    }

    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = parseCsvForms(text);

      if (!parsed.length) {
        setParsingError(
          "Nenhuma linha válida encontrada. Verifique se o arquivo é o CSV exportado do Google Forms."
        );
      } else {
        setRows(parsed);
      }
    } catch {
      setParsingError(
        "Erro ao ler o arquivo. Certifique-se de que é um CSV em UTF-8 exportado do Google Forms."
      );
    }
  }

  function normalizeActive(value: string): boolean {
    const v = value.trim().toLowerCase();
    if (v.startsWith("inativ")) return false; // "Inativo"
    if (["false", "0", "não", "nao", "no", "n"].includes(v)) return false;
    return true;
  }

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);
    setResults(null);
    setParsingError(null);

    try {
      const token = getToken();

      const payloadRows = rows.map((r) => ({
        identity_number: r.identity_number,
        name: r.name,
        om: r.om || null,
        role: r.role || "USER",
        posto_graduacao: r.posto_graduacao || "Soldado",
        active: normalizeActive(r.active),
        observation: r.observation || null,
        profile_photo_url: r.profile_photo_url || null,
      }));

      const res = await fetch(`${API_BASE}/users/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ rows: payloadRows }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Erro ao importar usuários");
      }

      const data = (await res.json()) as { results: ImportResult[] };
      setResults(data.results);
    } catch (err: any) {
      setParsingError(err.message || "Erro ao importar usuários");
    } finally {
      setImporting(false);
    }
  }

  if (!canEditUsers) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Importar usuários</h1>
        <p className="text-sm text-red-300">
          Você não tem permissão para importar usuários.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Importar usuários via planilha</h1>

      <section className="space-y-2 text-sm text-slate-300">
        <p>
          Use o CSV exportado do Google Forms com os seguintes campos (nomes
          exatos das colunas):
        </p>
        <code className="block rounded bg-slate-900 px-2 py-1 text-xs text-slate-100">
          Carimbo de data/hora, Nome Completo, Número de Identidade
          (identity_number), Organização Militar (OM), Posto/Graduação,
          Função/Cargo (role), Status do Perfil, Observações Adicionais, Foto de
          Perfil
        </code>
        <p className="text-xs text-slate-400">
          • <strong>Número de Identidade (identity_number)</strong> é usado como
          chave para localizar ou criar o usuário. <br />
          • Se já existir usuário com essa identidade e estiver inativo, será
          reativado. <br />
          • Para novos usuários, a senha inicial será igual ao número de
          identidade informado (o usuário pode alterar depois). <br />•{" "}
          <strong>Foto de Perfil</strong> deve ser uma URL do Google Drive ou
          similar; o sistema baixa a imagem, salva no perfil e gera o template
          de reconhecimento facial automaticamente.{" "}
          <strong>
            Lembre-se de liberar o acesso &quot;Leitor&quot; na pasta da imagem
            para &quot;Qualquer pessoa com o link&quot; no Google Drive.
          </strong>
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block text-xs text-slate-200"
          />
          {fileName && (
            <span className="text-xs text-slate-400">
              Arquivo selecionado:{" "}
              <span className="text-slate-100">{fileName}</span>
            </span>
          )}
        </div>

        {parsingError && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {parsingError}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>{rows.length} linhas prontas para importação.</span>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60">
                {importing ? "Importando..." : "Importar usuários"}
              </button>
            </div>

            <div className="max-h-80 overflow-auto rounded border border-slate-800">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Identidade</th>
                    <th className="px-3 py-2 text-left">Nome</th>
                    <th className="px-3 py-2 text-left">OM</th>
                    <th className="px-3 py-2 text-left">P/G</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Observações</th>
                    <th className="px-3 py-2 text-left">Foto (URL)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={`${r.identity_number}-${idx}`}
                      className="border-t border-slate-800">
                      <td className="px-3 py-1">{r.identity_number}</td>
                      <td className="px-3 py-1">{r.name}</td>
                      <td className="px-3 py-1">{r.om}</td>
                      <td className="px-3 py-1">{r.posto_graduacao}</td>
                      <td className="px-3 py-1">{r.role}</td>
                      <td className="px-3 py-1">{r.active}</td>
                      <td className="px-3 py-1 max-w-[220px] truncate">
                        {r.observation}
                      </td>
                      <td className="px-3 py-1 max-w-[260px] truncate">
                        {r.profile_photo_url}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {results && (
          <div className="mt-4 space-y-2 text-xs">
            <h2 className="font-semibold text-slate-200">
              Resultado da importação
            </h2>
            <div className="max-h-64 overflow-auto rounded border border-slate-800 bg-slate-950/60">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Identidade</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={`${r.identity_number}-${r.status}-${
                        r.message ?? ""
                      }`}
                      className="border-t border-slate-800">
                      <td className="px-3 py-1">{r.identity_number}</td>
                      <td className="px-3 py-1">{r.status}</td>
                      <td className="px-3 py-1 max-w-[260px] truncate">
                        {r.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default function BulkUsersImportPage() {
  return (
    <RequireAuth>
      <BulkUsersImportContent />
    </RequireAuth>
  );
}
