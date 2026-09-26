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

/** Unix seconds -> "26.09.2026". */
export function formatDay(unix: number) {
  const d = new Date(unix * 1000);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Unix seconds -> "14:05". */
export function formatTimeOfDay(unix: number) {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Seconds of audio -> "42 s", "11 min", "1 h 02 min" ("—" when unknown). */
export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 600) return `${Math.floor(seconds / 60)} min ${String(Math.round(seconds % 60)).padStart(2, "0")} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
