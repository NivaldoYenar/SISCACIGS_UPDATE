export type Role =
  | "ADMIN"
  | "USER"
  | "SCMT_OM"
  | "CMT_SU_E_S2"
  | "STI_OM"
  | "ARMEIRO";

export type PageId = "items" | "movements" | "users" | "terminal";

type Level = "none" | "read" | "crud";

const PAGE_PERMISSIONS: Record<Role, Record<PageId, Level>> = {
  ADMIN: {
    items: "crud",
    movements: "crud",
    users: "crud",
    terminal: "crud",
  },
  USER: {
    items: "none",
    movements: "none",
    users: "none",
    terminal: "none",
  },
  SCMT_OM: {
    items: "crud",
    movements: "crud",
    users: "crud",
    terminal: "none",
  },
  CMT_SU_E_S2: {
    items: "crud",
    movements: "crud",
    users: "crud",
    terminal: "none",
  },
  STI_OM: {
    items: "read",
    movements: "read",
    users: "crud",
    terminal: "none",
  },
  ARMEIRO: {
    items: "read",
    movements: "read",
    users: "read",
    terminal: "crud",
  },
};

export function canAccessPage(role: Role | undefined, page: PageId): boolean {
  if (!role) return false;
  return PAGE_PERMISSIONS[role]?.[page] !== "none";
}

export function canEditPage(role: Role | undefined, page: PageId): boolean {
  if (!role) return false;
  const level = PAGE_PERMISSIONS[role]?.[page];
  return level === "crud";
}
