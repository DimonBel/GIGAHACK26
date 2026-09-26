import { CalendarDays, LayoutList, Plus, Users, type LucideIcon } from "lucide-react";

import type { MinutesDoc, Suggestion } from "@/api/types";
import { cn } from "@/shared/lib/cn";
import type { MinutesSection } from "@/shared/types/domain";
import { Button, Overline } from "@/shared/ui";
import { itemCount, useMinutesStore } from "@/stores/minutes";

const item = (active: boolean) =>
  cn(
    "rounded-md px-3 py-2.5 text-left transition-colors lg:w-full",
    active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-sunken",
  );

const GENERAL: { kind: "participants" | "next"; label: string; icon: LucideIcon }[] = [
  { kind: "participants", label: "Participants", icon: Users },
  { kind: "next", label: "Next meeting", icon: CalendarDays },
];

interface TopicSidebarProps {
  doc: MinutesDoc;
  section: MinutesSection;
  suggestions: Suggestion[];
  isModerator: boolean;
  canEdit: boolean;
}

export function TopicSidebar({ doc, section, suggestions, isModerator, canEdit }: TopicSidebarProps) {
  const { select, addTopic } = useMinutesStore();
  const overview = section.kind === "overview";
  return (
    <aside className="-mx-4 flex min-w-0 flex-col gap-3 sm:-mx-6 lg:sticky lg:top-[88px] lg:mx-0 lg:gap-6">
      <nav
        aria-label="Topics"
        className="flex [scrollbar-width:none] gap-1 overflow-x-auto px-4 pb-1 sm:px-6 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        <button
          type="button"
          aria-current={overview ? "true" : undefined}
          onClick={() => select({ kind: "overview" })}
          className={cn(
            item(overview),
            "flex shrink-0 items-center gap-2.5 text-base font-medium lg:mb-4",
            overview ? "text-ink" : "text-ink-2",
          )}
        >
          <LayoutList aria-hidden className="size-4 text-muted" strokeWidth={1.75} />
          Overview
        </button>
        <Overline className="hidden justify-between px-3 pb-1.5 lg:flex">
          Topics <span className="tabular-nums">{doc.topics.length}</span>
        </Overline>
        {doc.topics.map((topic, i) => {
          const active = section.kind === "topic" && section.id === topic.id;
          const pending = isModerator
            ? suggestions.filter((s) => s.topicId === topic.id && s.state === "open").length
            : 0;
          const count = itemCount(topic);
          return (
            <button
              key={topic.id}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => select({ kind: "topic", id: topic.id })}
              className={cn(
                item(active),
                "grid w-[220px] shrink-0 grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2.5 lg:w-full",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums",
                  active ? "bg-primary text-white" : "bg-sunken text-subtle",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn("line-clamp-2 text-base font-medium", active ? "text-ink" : "text-ink-2")}
                >
                  {topic.title || "Untitled topic"}
                </span>
                <span className="text-sm text-muted tabular-nums">
                  {topic.time ? `${topic.time} · ` : ""}
                  {count} item{count === 1 ? "" : "s"}
                </span>
              </span>
              {pending > 0 && (
                <span
                  title={`${pending} suggestion(s) to review`}
                  aria-label={`${pending} suggestion(s) to review`}
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warn-soft px-1.5 text-sm font-semibold text-warn tabular-nums"
                >
                  {pending}
                </span>
              )}
            </button>
          );
        })}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={addTopic}
            className="shrink-0 justify-start self-center text-muted lg:mt-1 lg:self-stretch"
          >
            Add topic
          </Button>
        )}
      </nav>
      <nav
        aria-label="General"
        className="flex [scrollbar-width:none] gap-1 overflow-x-auto px-4 sm:px-6 lg:flex-col lg:px-0"
      >
        <Overline className="hidden px-3 pb-1.5 lg:block">General</Overline>
        {GENERAL.map(({ kind, label, icon: Icon }) => {
          const active = section.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => select({ kind })}
              className={cn(
                item(active),
                "flex shrink-0 items-center gap-2.5 text-base font-medium",
                active ? "text-ink" : "text-ink-2",
              )}
            >
              <Icon aria-hidden className="size-4 text-muted" strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
