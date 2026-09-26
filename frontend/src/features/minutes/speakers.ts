import type { Participant } from "@/api/types";

// Dot colours for voices; the same speaker keeps the same colour in the live transcript and the minutes.
const COLORS = ["bg-primary", "bg-info", "bg-warn", "bg-danger", "bg-ok", "bg-ink-2", "bg-subtle"];

export function speakerColor(speaker: string) {
  const n = Number.parseInt(speaker.replace(/\D/g, ""), 10) || 1;
  return COLORS[(n - 1) % COLORS.length];
}

/** "SPEAKER 2" -> the name the moderator gave that voice, else "Speaker 2". */
export function speakerName(participants: Participant[], speaker: string) {
  const named = participants.find((p) => p.speaker === speaker)?.name.trim();
  return named || speaker.replace(/^SPEAKER/, "Speaker");
}
