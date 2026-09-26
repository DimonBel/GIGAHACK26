import type { Cabinet, Screen } from "@/shared/types/domain";

export const CABINETS: Cabinet[] = ["admin", "moderator", "participant"];

/** Header tabs of each cabinet, in order. */
export const TABS: Record<Cabinet, Screen[]> = {
  admin: ["users", "roles", "security", "templates", "routing"],
  moderator: ["meetings", "new", "editor"],
  participant: ["moms", "read", "tasks"],
};

/** Screen a cabinet opens on. */
export const HOME: Record<Cabinet, Screen> = { admin: "users", moderator: "editor", participant: "read" };

export const CABINET_DESCRIPTION: Record<Cabinet, string> = {
  admin: "Users, cabinet access, permissions, 2FA policy, templates and email routing.",
  moderator: "Record or upload meetings, edit minutes topic by topic, approve and send.",
  participant: "Read minutes, track your tasks, suggest additions to a topic.",
};

export function isCabinet(value: string | undefined): value is Cabinet {
  return CABINETS.includes(value as Cabinet);
}

export function cabinetPath(cabinet: Cabinet, screen: Screen = HOME[cabinet]) {
  return `/${cabinet}/${screen}`;
}

export type CabinetAccess = "current" | "open" | "none";

export const CABINET_ACCESS_LABEL: Record<CabinetAccess, string> = {
  current: "Current",
  open: "Open →",
  none: "No access",
};

/** Whether an account can open a cabinet, and whether it is the one in use. */
export function cabinetAccess(cabinet: Cabinet, allowed: Cabinet[], current: Cabinet | null): CabinetAccess {
  if (!allowed.includes(cabinet)) return "none";
  return cabinet === current ? "current" : "open";
}
