import { TODAY } from "@/shared/config/constants";

/** "2026-09-28" -> "28.09.2026" ("—" when empty). */
export function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export type DueTone = "overdue" | "today" | "later";

export function dueTone(iso: string): DueTone {
  return iso < TODAY ? "overdue" : iso === TODAY ? "today" : "later";
}

export const DUE_TEXT: Record<DueTone, string> = {
  overdue: "text-danger",
  today: "text-warn",
  later: "text-ink-2",
};

/** Seconds -> "mm:ss". */
export function formatClock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "Overdue · 25.09.2026", "Due today", "Due 28.09.2026". */
export function dueLabel(iso: string) {
  const tone = dueTone(iso);
  if (tone === "today") return "Due today";
  return `${tone === "overdue" ? "Overdue ·" : "Due"} ${formatDate(iso)}`;
}
