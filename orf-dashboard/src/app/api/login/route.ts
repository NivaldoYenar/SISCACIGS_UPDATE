// src/app/api/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_API_URL } from "@/lib/api-url";
import { setTokenCookie } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  // Pega o body como texto cru (pode ser form-urlencoded, JSON, etc.)
  const contentType = req.headers.get("content-type") || "application/json";
  const rawBody = await req.text();

  // Repassa pro backend exatamente no mesmo formato que chegou
  const backendRes = await fetch(`${INTERNAL_API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: rawBody,
  });

  const data = await backendRes.json().catch(() => ({}));

  if (!backendRes.ok) {
    // Propaga o erro pro front
    return NextResponse.json(data, { status: backendRes.status });
  }

  // Ajusta aqui o nome do campo conforme seu backend
  const token = data.access_token || data.token;
  if (typeof token === "string") {
    // grava cookie httpOnly
    setTokenCookie(token);
  }

  return NextResponse.json(data);
}
