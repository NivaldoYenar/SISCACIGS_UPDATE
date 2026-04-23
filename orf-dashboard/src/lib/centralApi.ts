// src/lib/centralApi.ts
import { cookies } from "next/headers";

import { redirect } from "next/navigation";

import { INTERNAL_API_URL } from "@/lib/api-url";

const CENTRAL_API_URL = INTERNAL_API_URL;

// src/lib/centralApi.ts

export type ItemStatus = {
  item_id: string;
  item_name: string;
  serial_number: string | null;
  description: string | null;
  status: "available" | "checked_out" | "lost" | "maintenance" | string;

  model?: string | null;
  brand?: string | null;
  disturbance?: string | null;
  asset_number?: string | null;

  item_type_id?: string | null;
  item_type_name?: string | null;

  current_user_id: string | null;
  current_user_name: string | null;
  current_user_identity_number?: string | null;

  kiosk_id: string | null;
  kiosk_name: string | null;
  since_timestamp?: string | null;

  current_destination?: "servico" | "missao" | "outro" | null;
  current_observation?: string | null;
};

export type PaginatedItemStatus = {
  items: ItemStatus[];
  total: number;
  page: number;
  page_size: number;
};

export type UserRow = {
  id: string;
  name: string;
  identity_number: string | null;
  om: string | null;
  role: string;
  active: boolean;
  created_at: string;
  posto_graduacao?: string | null;
};

export type MovementLog = {
  movement_id: string;
  action: "cautela" | "descautela" | string;
  confidence: number | null;
  requires_review: boolean;
  captured_at: string;
  received_at: string;
  user_id: string | null;
  user_name: string | null;
  item_id: string | null;
  item_name: string | null;
  kiosk_id: string | null;
  kiosk_code: string | null;
  kiosk_name: string | null;
  user_identity_number: string | null;
  item_serial_number: string | null;
  movement_disturbance?: string | null;
  item_disturbance?: string | null;
  logged_user_id: string | null;
  logged_user_name: string | null;
};

export type PaginatedMovements = {
  items: MovementLog[];
  total: number;
  page: number;
  page_size: number;
};

export type ItemType = {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
};

export type ItemTypeCreate = {
  name: string;
  description?: string | null;
};

export type ItemTypeUpdate = {
  name?: string;
  description?: string | null;
};

export type Item = {
  id: string;
  name: string;
  serial_number?: string | null;
  description?: string | null;
  status: string;
  model?: string | null;
  brand?: string | null;
  disturbance?: string | null;
  asset_number?: string | null;
  item_type_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ItemCreate = {
  name: string;
  serial_number?: string | null;
  description?: string | null;
  status?: string;
  model?: string | null;
  brand?: string | null;
  disturbance?: string | null;
  asset_number?: string | null;
  item_type_id?: string | null;
};

export type ItemUpdate = Partial<ItemCreate>;

async function getAuthHeader() {
  const cookieStore = cookies();
  const rawToken = (await cookieStore).get("orf_token")?.value;

  if (!rawToken) {
    throw new Error("Usuário não autenticado (sem token)");
  }

  return rawToken.startsWith("Bearer ") ? rawToken : `Bearer ${rawToken}`;
}

export async function fetchItemsStatus(): Promise<ItemStatus[]> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/items/status`, {
    cache: "no-store",
    headers: {
      Authorization: authHeader,
    },
  });

  if (res.status === 401) redirect("/401");
  if (res.status === 403) redirect("/403");

  if (!res.ok) {
    throw new Error(`Erro ao buscar itens: ${res.status}`);
  }

  return res.json();
}

export async function fetchRecentMovements(limit = 50): Promise<MovementLog[]> {
  const authHeader = await getAuthHeader();

  const res = await fetch(
    `${CENTRAL_API_URL}/movements/recent?limit=${encodeURIComponent(
      String(limit)
    )}`,
    {
      cache: "no-store",
      headers: {
        Authorization: authHeader,
      },
    }
  );

  if (res.status === 401) redirect("/401");
  if (res.status === 403) redirect("/403");

  if (!res.ok) {
    throw new Error(`Erro ao buscar movimentos: ${res.status}`);
  }

  return res.json();
}

// export async function fetchItemStatusById(
//   itemId: string
// ): Promise<ItemStatus | null> {
//   const all = await fetchItemsStatus();
//   return all.find((i) => i.item_id === itemId) ?? null;
// }

export async function fetchItemStatusById(
  itemId: string
): Promise<ItemStatus | null> {
  const authHeader = await getAuthHeader();

  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "1");
  params.set("item_id", itemId); // importante: backend filtra por item_id

  const res = await fetch(
    `${CENTRAL_API_URL}/items/status?${params.toString()}`,
    {
      cache: "no-store",
      headers: {
        Authorization: authHeader,
      },
    }
  );

  if (res.status === 401) redirect("/401");
  if (res.status === 403) redirect("/403");

  if (!res.ok) {
    throw new Error(`Erro ao buscar item ${itemId}: ${res.status}`);
  }

  const data = (await res.json()) as PaginatedItemStatus;
  return data.items[0] ?? null;
}

export async function fetchItemMovements(
  itemId: string,
  limit = 200
): Promise<MovementLog[]> {
  const all = await fetchRecentMovements(limit);
  return all.filter((m) => m.item_id === itemId);
}

export async function fetchItemTypes(): Promise<ItemType[]> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/item-types`, {
    headers: {
      Authorization: authHeader,
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Erro ao buscar tipos de item");
  return res.json();
}

export async function createItemType(
  payload: ItemTypeCreate
): Promise<ItemType> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/item-types`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Erro ao criar tipo de item");
  return res.json();
}

export async function updateItemType(
  id: string,
  payload: ItemTypeUpdate
): Promise<void> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/item-types/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Erro ao atualizar tipo de item");
}

export async function deleteItemType(id: string): Promise<void> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/item-types/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!res.ok) throw new Error("Erro ao excluir tipo de item");
}

export async function fetchItems(): Promise<Item[]> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/items`, {
    headers: {
      Authorization: authHeader,
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Erro ao buscar itens");
  return res.json();
}

export async function createItem(payload: ItemCreate): Promise<Item> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Erro ao criar item");
  return res.json();
}

export async function updateItem(
  id: string,
  payload: ItemUpdate
): Promise<void> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/items/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Erro ao atualizar item");
}

export async function deleteItem(id: string): Promise<void> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${CENTRAL_API_URL}/items/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!res.ok) throw new Error("Erro ao excluir item");
}

export async function fetchItemsSummary() {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${CENTRAL_API_URL}/items/status/summary`, {
    headers: {
      Authorization: authHeader,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Erro ao buscar resumo de itens");
  return res.json() as Promise<{
    total: number;
    emprestados: number;
    disponiveis: number;
    em_manutencao: number;
    perdidos: number;
  }>;
}

export async function fetchItemMovementsPaginated(
  itemId: string,
  page = 1,
  pageSize = 20
): Promise<PaginatedMovements> {
  const authHeader = await getAuthHeader();

  const params = new URLSearchParams();
  params.set("item_id", itemId);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  const res = await fetch(`${CENTRAL_API_URL}/movements?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Authorization: authHeader,
    },
  });

  if (res.status === 401) redirect("/401");
  if (res.status === 403) redirect("/403");

  if (!res.ok) {
    throw new Error(`Erro ao buscar movimentos do item: ${res.status}`);
  }

  return res.json() as Promise<PaginatedMovements>;
}
