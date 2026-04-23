"use client";

import { useAuth } from "@/components/auth-provider";
import type { Role } from "@/lib/permissions";
import { canAccessPage, canEditPage } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ItemStatus } from "@/lib/centralApi";
import { ItemsTable } from "@/components/items-table";

type ItemsPageClientProps = {
  items: ItemStatus[];
};

export function ItemsPageClient({ items }: ItemsPageClientProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // não logado
    if (!user) {
      router.replace("/401");
      return;
    }

    // sem permissão pra página
    if (!canAccessPage(user.role as Role | undefined, "items")) {
      router.replace("/403");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return null;
  }

  if (!canAccessPage(user.role as Role | undefined, "items")) {
    return null;
  }

  const canEdit = canEditPage(user.role as Role | undefined, "items");

  return (
    <main className="min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Itens &amp; Situação Atual</h1>
      </div>

      <ItemsTable items={items} canEdit={canEdit} />
    </main>
  );
}
