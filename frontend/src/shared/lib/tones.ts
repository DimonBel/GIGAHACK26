import type { Cabinet, CodeSystem, MeetingStatusTone, MeetingType } from "@/shared/types/domain";

/** Meeting types keep their colours, but only as a dot. */
export const MEETING_TYPE_TONE: Record<MeetingType, { dot: string }> = {
  Medical: { dot: "bg-primary" },
  Executive: { dot: "bg-info" },
  Administrative: { dot: "bg-warn" },
};

export const MEETING_TYPES = Object.keys(MEETING_TYPE_TONE) as MeetingType[];

export const CABINET_DOT: Record<Cabinet, string> = {
  admin: "bg-on-ink",
  moderator: "bg-ok",
  participant: "bg-warn-line",
};

export const STATUS_TONE: Record<MeetingStatusTone, { pill: string; dot: string }> = {
  warn: { pill: "bg-warn-soft text-warn", dot: "bg-warn" },
  info: { pill: "bg-info-soft text-info", dot: "bg-info" },
  ok: { pill: "bg-primary-soft text-primary", dot: "bg-primary" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger" },
};

export const CODE_TEXT: Record<CodeSystem, string> = { "ICD-10": "text-primary", ACHI: "text-info" };
