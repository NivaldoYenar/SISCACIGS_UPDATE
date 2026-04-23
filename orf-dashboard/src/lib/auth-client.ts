// src/lib/auth-client.ts
export type AuthUser = {
  id: string;
  name: string;
  role: "ADMIN" | "USER" | "SCMT_OM" | "CMT_SU_E_S2" | "STI_OM" | "ARMEIRO";
};


export const API_BASE =
  process.env.NEXT_PUBLIC_CENTRAL_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "orf_token";
const USER_KEY = "orf_user";

export function saveAuth(token: string, user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  // cookie simples, visível no front, suficiente pra esse caso
  document.cookie = `orf_token=${token}; path=/;`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

