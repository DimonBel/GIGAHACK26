import type { Task } from "@/shared/types/domain";

/** Tasks assigned to the signed-in participant, and which ones are already done. */
export const MY_TASKS: Task[] = [
  { id: "k-1", text: "Redactare protocol de protecție renală, v1", from: "Consiliu medical — Cardiologie · Topic 2", due: "2026-10-01" },
  { id: "k-2", text: "Actualizare protocol sedare RMN pediatric", from: "Consiliu medical — Oncologie · Topic 3", due: "2026-09-22" },
  { id: "k-3", text: "Propunere grafic ture ATI", from: "Ședință administrativă · Topic 1", due: "2026-09-30" },
];

export const MY_TASKS_DONE = ["k-2"];
