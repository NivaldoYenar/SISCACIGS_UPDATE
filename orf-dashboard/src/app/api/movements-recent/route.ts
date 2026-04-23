// src/app/api/movements-recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_API_URL } from "@/lib/api-url";

const CENTRAL_API_URL = INTERNAL_API_URL;

export async function GET(req: NextRequest) {
  const rawToken = req.cookies.get("orf_token")?.value;
  console.log("[/api/movements-recent] token:", rawToken);

  if (!rawToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const authHeader = rawToken.startsWith("Bearer ")
    ? rawToken
    : `Bearer ${rawToken}`;

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ?? "200";

  const backendRes = await fetch(
    `${CENTRAL_API_URL}/movements/recent?limit=${encodeURIComponent(limit)}`,
    {
      headers: {
        Authorization: authHeader,
      },
    }
  );

  const body = await backendRes.text();
  const contentType =
    backendRes.headers.get("content-type") || "application/json";

  return new NextResponse(body, {
    status: backendRes.status,
    headers: { "content-type": contentType },
  });
}
