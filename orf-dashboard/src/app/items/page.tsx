// src/app/items/page.tsx
import { fetchItemsStatus } from "@/lib/centralApi";
import { ItemsPageClient } from "./items-client";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const items = await fetchItemsStatus(); // rodando no server

  return <ItemsPageClient items={items} />;
}
