import { cookies } from "next/headers";

const TOKEN_COOKIE_NAME = "orf_token";

/**
 * Lê o token JWT dos cookies — funciona tanto em Server Components
 * quanto em Route Handlers (/api/...).
 */
export async function getTokenFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value ?? null;
    return token;
  } catch {
    return null;
  }
}

/**
 * Salva o token JWT no cookie (para chamada no login).
 * OBS: só funciona dentro de route handlers (POST /login).
 */
export async function setTokenCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: TOKEN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}
/**
 * Remove o token (logout)
 */
export async function clearTokenCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE_NAME);
}
