import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_API_URL } from "@/lib/api-url";

const CENTRAL_API_URL = INTERNAL_API_URL;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = (await params).id;

  const rawToken = req.cookies.get("orf_token")?.value;

  if (!rawToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const authHeader = rawToken.startsWith("Bearer ")
    ? rawToken
    : `Bearer ${rawToken}`;

  const backendRes = await fetch(
    `${CENTRAL_API_URL}/users/${userId}/profile-photo`,
    {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    }
  );

  if (!backendRes.ok) {
    return new NextResponse(backendRes.body, {
      status: backendRes.status,
    });
  }

  const arrayBuffer = await backendRes.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": backendRes.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "no-store",
    },
  });
}
