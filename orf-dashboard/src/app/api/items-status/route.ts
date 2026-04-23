// src/app/api/items-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_API_URL } from "@/lib/api-url";

const CENTRAL_API_URL = INTERNAL_API_URL;

export async function GET(req: NextRequest) {
  const rawToken = req.cookies.get("orf_token")?.value;
  console.log("[/api/items-status] token:", rawToken);

  if (!rawToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const authHeader = rawToken.startsWith("Bearer ")
    ? rawToken
    : `Bearer ${rawToken}`;

  const backendRes = await fetch(`${CENTRAL_API_URL}/items/status`, {
    headers: {
      Authorization: authHeader,
    },
  });

  const body = await backendRes.text();
  const contentType =
    backendRes.headers.get("content-type") || "application/json";

  return new NextResponse(body, {
    status: backendRes.status,
    headers: { "content-type": contentType },
  });
}
