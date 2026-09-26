import { ChevronRight } from "lucide-react";

import type { Meeting } from "@/shared/types/domain";
import { StatusBadge, TypeBadge } from "@/shared/ui";

export const MEETING_COLUMNS = "md:grid-cols-[minmax(0,1fr)_110px_80px_170px_16px] md:gap-6";

export function MeetingRow({ meeting: m, onOpen }: { meeting: Meeting; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-canvas ${MEETING_COLUMNS}`}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-body font-medium text-ink">{m.title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
          <TypeBadge type={m.type} />
          <span>{m.topicCount} topics</span>
          <span>{m.langs}</span>
          <span className="tabular-nums md:hidden">
            {m.date} · {m.length}
          </span>
        </span>
      </span>
      <span className="hidden text-small text-ink-2 tabular-nums md:block">{m.date}</span>
      <span className="hidden text-small text-ink-2 tabular-nums md:block">{m.length}</span>
      <StatusBadge tone={m.statusTone} className="justify-self-end md:justify-self-start">
        {m.status}
      </StatusBadge>
      <ChevronRight
        aria-hidden
        className="hidden size-4 text-subtle transition-colors group-hover:text-ink md:block"
        strokeWidth={1.75}
      />
    </button>
  );
}
