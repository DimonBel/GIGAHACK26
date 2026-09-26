import type { Meeting } from "@/api/meetings";
import type { MinutesDoc, User } from "@/api/types";

export const ELENA: User = {
  id: 1,
  email: "elena.rusu@medpark.md",
  name: "Dr. Elena Rusu",
  initials: "ER",
  dept: "Cardiologie",
  cabinets: ["moderator", "participant"],
};

export const NATALIA: User = {
  ...ELENA,
  id: 3,
  email: "natalia.popescu@medpark.md",
  name: "Dr. Natalia Popescu",
  initials: "NP",
  cabinets: ["participant"],
};

export function meeting(fields: Partial<Meeting> = {}): Meeting {
  return {
    id: 7,
    title: "ICU round",
    type: "Medical",
    language: "ro",
    speakers: null,
    status: "draft",
    error: null,
    duration: 702,
    topicCount: 2,
    created: 1790000000,
    createdBy: "Dr. Elena Rusu",
    approved: null,
    approvedBy: null,
    hasTranscript: true,
    queuePosition: null,
    progress: null,
    ...fields,
  };
}

export function doc(): MinutesDoc {
  return {
    version: 1,
    title: "ICU round",
    summary: "Two patients reviewed.",
    keyMoments: [{ time: "03:52", text: "Stopped Forxiga. — Bed 9" }],
    aiSuggestions: [],
    warnings: [],
    participants: [{ speaker: "SPEAKER 1", name: "", role: "leads the round", seconds: 231 }],
    topics: [
      {
        id: "t1",
        title: "Patient 1",
        time: "00:00",
        blocks: [
          { id: "b1", kind: "text", label: "Status", text: "Stable" },
          {
            id: "b2",
            kind: "list",
            label: "Findings",
            items: [{ id: "i1", text: "Creatinine 240", time: "00:40" }],
          },
        ],
      },
      {
        id: "t2",
        title: "Bed 9",
        time: "03:00",
        blocks: [{ id: "b3", kind: "tasks", label: "Tasks", items: [] }],
      },
    ],
    next: { date: "", time: "", place: "", agenda: "" },
    attendees: [],
  };
}
