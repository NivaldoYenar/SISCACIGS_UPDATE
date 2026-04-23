"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  API_BASE,
  AuthUser,
  clearAuth,
  getStoredUser,
  getToken,
  saveAuth,
} from "@/lib/auth-client";

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // carregar token e /auth/me no início
  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();

    async function bootstrap() {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          clearAuth();
          setUser(null);
        } else {
          const me = (await res.json()) as {
            id: string;
            name: string;
            role: "ADMIN" | "USER";
          };
          const normalized: AuthUser = {
            id: me.id,
            name: me.name,
            role: me.role,
          };
          saveAuth(token, normalized);
          setUser(normalized);
        }
      } catch {
        clearAuth();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    if (storedUser && token) {
      setUser(storedUser);
      setLoading(false);
      // opcional: validar em background
      bootstrap();
    } else {
      bootstrap();
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const body = new URLSearchParams();
    body.set("username", username);
    body.set("password", password);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? "Falha no login");
    }

    const json = (await res.json()) as {
      access_token: string;
      user: AuthUser;
    };

    saveAuth(json.access_token, json.user);
    setUser(json.user);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
