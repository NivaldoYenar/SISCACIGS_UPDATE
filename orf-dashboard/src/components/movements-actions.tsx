"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import type { Role } from "@/lib/permissions";

function canAccessManual(role?: Role) {
  return role === "ADMIN" || role === "SCMT_OM" || role === "CMT_SU_E_S2";
}

export function MovementsActions() {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  if (!canAccessManual(role)) return null;

  return (
    <Link
      href="/movements/manual"
      className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-sky-500">
      Cautela / descautela manual
    </Link>
  );
}
