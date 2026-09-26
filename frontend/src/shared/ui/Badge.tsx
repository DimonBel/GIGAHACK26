import { cn } from "@/shared/lib/cn";
import { MEETING_TYPE_TONE, STATUS_TONE } from "@/shared/lib/tones";
import type { MeetingStatusTone, MeetingType } from "@/shared/types/domain";

/** Small coloured dot: the only place signal colours appear in lists. */
export function Dot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />;
}

/** Meeting type as dot + name. */
export function TypeBadge({ type, className }: { type: MeetingType; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-caption font-medium text-ink-2", className)}>
      <Dot className={MEETING_TYPE_TONE[type].dot} />
      {type}
    </span>
  );
}

/** Workflow state (awaiting approval, transcribing, sent) as a quiet pill. */
export function StatusBadge({ tone, children, className }: { tone: MeetingStatusTone; children: string; className?: string }) {
  const t = STATUS_TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap",
        t.pill,
        className,
      )}
    >
      <Dot className={cn("size-1.5", t.dot)} />
      {children}
    </span>
  );
}
