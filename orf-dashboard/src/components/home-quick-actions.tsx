"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { canAccessPage, type Role } from "@/lib/permissions";
import { useState } from "react";
import { getToken } from "@/lib/auth-client";

export function HomeQuickActions() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const role = user?.role as Role | undefined;

  const canAccessTerminal = role ? canAccessPage(role, "terminal") : false;

  const CENTRAL_API_URL =
    process.env.NEXT_PUBLIC_CENTRAL_API_URL || "http://127.0.0.1:8000";

  // if (!canAccessTerminal) return null;

  async function handleGenerateTodayReport() {
    try {
      setLoading(true);

      const token = await getToken();
      if (!token) {
        alert("Token de autenticação não encontrado. Faça login novamente.");
        return;
      }

      const authHeader = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;

      const res = await fetch(`${CENTRAL_API_URL}/reports/relatorio1/html`, {
        headers: {
          Authorization: authHeader,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Erro ao gerar relatório (${res.status}): ${text}`);
      }

      const html = await res.text();
      const win = window.open("", "_blank");
      if (!win) {
        throw new Error("Popup bloqueado pelo navegador.");
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateServiceReport() {
    try {
      setLoading(true);

      const token = await getToken();
      if (!token) {
        alert("Token de autenticação não encontrado. Faça login novamente.");
        return;
      }

      const authHeader = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;

      const res = await fetch(`${CENTRAL_API_URL}/reports/relatorio2/html`, {
        headers: {
          Authorization: authHeader,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Erro ao gerar relatório de serviço (${res.status}): ${text}`
        );
      }

      const html = await res.text();
      const win = window.open("", "_blank");
      if (!win) {
        throw new Error("Popup bloqueado pelo navegador.");
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateMissionReport() {
    try {
      setLoading(true);

      const token = await getToken();
      if (!token) {
        alert("Token de autenticação não encontrado. Faça login novamente.");
        return;
      }

      const authHeader = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;

      const res = await fetch(`${CENTRAL_API_URL}/reports/relatorio3/html`, {
        headers: {
          Authorization: authHeader,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Erro ao gerar relatório de missão (${res.status}): ${text}`
        );
      }

      const html = await res.text();
      const win = window.open("", "_blank");
      if (!win) {
        throw new Error("Popup bloqueado pelo navegador.");
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateLostAndMaintenanceReport() {
    try {
      setLoading(true);

      const token = await getToken();
      if (!token) {
        alert("Token de autenticação não encontrado. Faça login novamente.");
        return;
      }

      const authHeader = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;

      const res = await fetch(`${CENTRAL_API_URL}/reports/relatorio4/html`, {
        headers: {
          Authorization: authHeader,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Erro ao gerar relatório de perdidos/em manutenção (${res.status}): ${text}`
        );
      }

      const html = await res.text();
      const win = window.open("", "_blank");
      if (!win) {
        throw new Error("Popup bloqueado pelo navegador.");
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex justify-end gap-2">
      {canAccessTerminal && (
        <Link
          href="/terminal"
          className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-sky-500">
          Abrir terminal
        </Link>
      )}
      <button
        type="button"
        onClick={handleGenerateTodayReport}
        disabled={loading}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 disabled:opacity-60">
        {loading ? "Gerando..." : "Relatório 1 (dia)"}
      </button>

      <button
        type="button"
        onClick={handleGenerateServiceReport}
        disabled={loading}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 disabled:opacity-60">
        {loading ? "Gerando..." : "Relatório 2 (serviço)"}
      </button>

      <button
        type="button"
        onClick={handleGenerateMissionReport}
        disabled={loading}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 disabled:opacity-60">
        {loading ? "Gerando..." : "Relatório 3 (missão)"}
      </button>

      <button
        type="button"
        onClick={handleGenerateLostAndMaintenanceReport}
        disabled={loading}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 disabled:opacity-60">
        {loading ? "Gerando..." : "Relatório 4 (perdidos/manutenção)"}
      </button>
    </div>
  );
}
