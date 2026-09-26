import { useMinutesStore } from "@/stores/minutes";

/** "03:52": where it was said; opens the topic's transcript at that line. */
export function TimeLink({ topicId, time }: { topicId: string; time?: string | null }) {
  const focusTime = useMinutesStore((s) => s.focusTime);
  if (!time) return null;
  return (
    <button
      type="button"
      onClick={() => focusTime(topicId, time)}
      title="Show in the transcript"
      className="rounded shrink-0 px-1 text-sm text-muted tabular-nums transition-colors hover:bg-primary-soft hover:text-primary"
    >
      {time}
    </button>
  );
}

export function Unverified({ values }: { values?: string | null }) {
  if (!values) return null;
  return (
    <span
      title="These values were not found in the transcript. Check them against the recording."
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn"
    >
      Check {values}
    </span>
  );
}
