import { Check, CircleAlert, LoaderCircle } from "lucide-react";

import { formatTimeOfDay } from "@/shared/lib/date";
import { useMinutesStore } from "@/stores/minutes";

/** Autosave state of the draft: saved / unsaved / saving / failed (retry) / changed elsewhere (reload). */
export function SaveIndicator() {
  const { save, savedAt, saveError, saveNow, meetingId, load } = useMinutesStore();
  const base = "flex items-center gap-1.5 text-base";
  switch (save) {
    case "saving":
      return (
        <span role="status" className={`${base} text-muted`}>
          <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
          Saving…
        </span>
      );
    case "dirty":
      return <span className={`${base} text-muted`}>Unsaved changes</span>;
    case "error":
      return (
        <span role="alert" className={`${base} text-danger`}>
          <CircleAlert aria-hidden className="size-4" strokeWidth={1.75} />
          Not saved
          <button
            type="button"
            onClick={() => void saveNow()}
            className="font-medium underline underline-offset-2"
          >
            Retry
          </button>
        </span>
      );
    case "conflict":
      return (
        <span role="alert" title={saveError ?? undefined} className={`${base} text-danger`}>
          <CircleAlert aria-hidden className="size-4" strokeWidth={1.75} />
          Changed elsewhere
          <button
            type="button"
            onClick={() => meetingId !== null && void load(meetingId)}
            className="font-medium underline underline-offset-2"
          >
            Reload
          </button>
        </span>
      );
    case "saved":
      return (
        <span className={`${base} text-muted`}>
          <Check aria-hidden className="size-4 text-ok" strokeWidth={2} />
          {savedAt ? `Saved ${formatTimeOfDay(savedAt / 1000)}` : "All changes saved"}
        </span>
      );
  }
}
