import type { Attendee, NextMeeting } from "@/shared/types/domain";

export const ATTENDEES: Attendee[] = [
  { name: "Dr. Elena Rusu", dept: "Cardiologie", role: "Moderator" },
  { name: "Dr. Andrei Cebotari", dept: "Chirurgie CV", role: "Participant" },
  { name: "Dr. Natalia Popescu", dept: "ATI", role: "Participant" },
  { name: "Dr. Igor Munteanu", dept: "Imagistică", role: "Participant" },
  { name: "Victor Ciobanu", dept: "Direcția medicală", role: "Participant" },
  { name: "Olga Sîrbu", dept: "Farmacie clinică", role: "Participant" },
  { name: "Maria Lungu", dept: "Asistentă șefă", role: "Participant" },
];

/** Names offered as owner / author in the editor. */
export const PEOPLE = ATTENDEES.map((a) => a.name);

/** Owner of a new view or task, and the due date a new task starts with. */
export const DEFAULT_OWNER = "Dr. Elena Rusu";
export const DEFAULT_DUE = "2026-10-02";

export const NEXT_MEETING: NextMeeting = {
  date: "2026-10-02",
  time: "14:00",
  place: "Sala de consilii, bloc B",
  agenda:
    "Evaluare post-PCI: ecocardiografie de control, funcție renală, toleranța la DAPT. Aprobarea protocolului de protecție renală.",
};
