import { ChevronRight } from "lucide-react";

import type { Meeting } from "@/api/meetings";
import { formatDay, formatDuration, formatTimeOfDay } from "@/shared/lib/date";
import { meetingStatus } from "@/shared/lib/meetingStatus";
import { StatusBadge, TypeBadge } from "@/shared/ui";

export const MEETING_COLUMNS = "md:grid-cols-[minmax(0,1fr)_120px_80px_170px_16px] md:gap-6";

export function MeetingRow({ meeting: m, onOpen }: { meeting: Meeting; onOpen: () => void }) {
  const status = meetingStatus(m);
  const topics = m.topicCount === null ? null : `${m.topicCount} topic${m.topicCount === 1 ? "" : "s"}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-canvas ${MEETING_COLUMNS}`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-md font-medium text-ink">{m.title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <TypeBadge type={m.type} />
          {topics && <span>{topics}</span>}
          {m.createdBy && <span className="hidden sm:inline">{m.createdBy}</span>}
          <span className="tabular-nums md:hidden">
            {formatDay(m.created)} · {formatDuration(m.duration)}
          </span>
        </span>
      </span>
      <span className="hidden flex-col text-base text-ink-2 tabular-nums md:flex">
        {formatDay(m.created)}
        <span className="text-sm text-muted">{formatTimeOfDay(m.created)}</span>
      </span>
      <span className="hidden text-base text-ink-2 tabular-nums md:block">{formatDuration(m.duration)}</span>
      <StatusBadge tone={status.tone} className="justify-self-end md:justify-self-start">
        {status.label}
      </StatusBadge>
      <ChevronRight
        aria-hidden
        className="hidden size-4 text-subtle transition-all group-hover:translate-x-0.5 group-hover:text-ink md:block"
        strokeWidth={1.75}
      />
    </button>
  );
}
