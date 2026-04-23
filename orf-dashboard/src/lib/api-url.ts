export const INTERNAL_API_URL =
  process.env.INTERNAL_CENTRAL_API_URL || "http://api:8000";

export const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_CENTRAL_API_URL || "http://localhost:8000";

export const CENTRAL_API_URL =
  typeof window === "undefined" ? INTERNAL_API_URL : PUBLIC_API_URL;