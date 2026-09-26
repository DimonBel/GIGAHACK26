import type { Meeting } from "@/api/meetings";
import type { MeetingStatusTone } from "@/shared/types/domain";

/** What a meeting's status pill says, and its colour. */
export function meetingStatus(m: Pick<Meeting, "status" | "queuePosition" | "progress">): {
  label: string;
  tone: MeetingStatusTone;
} {
  switch (m.status) {
    case "queued":
      return { label: m.queuePosition ? `Queued · ${m.queuePosition} ahead` : "Queued", tone: "info" };
    case "processing":
      return m.progress !== null && m.progress < 100
        ? { label: `Transcribing ${Math.round(m.progress)}%`, tone: "info" }
        : { label: "Writing minutes", tone: "info" };
    case "draft":
      return { label: "Awaiting approval", tone: "warn" };
    case "approved":
      return { label: "Approved", tone: "ok" };
    case "failed":
      return { label: "Failed", tone: "danger" };
  }
}
