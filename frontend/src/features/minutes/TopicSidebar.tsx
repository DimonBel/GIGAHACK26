import { CalendarDays, Plus, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { Button, Overline, TypeBadge } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

const item = (active: boolean) =>
  cn(
    "rounded-md px-3 py-2.5 text-left transition-colors lg:w-full",
    active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-sunken",
  );

const GENERAL: { kind: "participants" | "next"; label: string; icon: LucideIcon }[] = [
  { kind: "participants", label: "Participants", icon: Users },
  { kind: "next", label: "Next meeting", icon: CalendarDays },
];

export function TopicSidebar({ isModerator }: { isModerator: boolean }) {
  const { topics, section, selectTopic, selectGeneral, addTopic } = useMinutesStore();
  return (
    <aside className="-mx-4 flex min-w-0 flex-col gap-3 sm:-mx-6 lg:sticky lg:top-[88px] lg:mx-0 lg:gap-6">
      <nav aria-label="Topics" className="flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:px-6 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        <Overline className="hidden justify-between px-3 pb-1.5 lg:flex">
          Topics <span className="tabular-nums">{topics.length}</span>
        </Overline>
        {topics.map((topic, i) => {
          const active = section.kind === "topic" && section.id === topic.id;
          const pending = isModerator ? topic.suggestions.length : 0;
          return (
            <button
              key={topic.id}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => selectTopic(topic.id)}
              className={cn(item(active), "grid w-[240px] shrink-0 grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2.5 lg:w-full")}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums",
                  active ? "bg-primary text-white" : "bg-sunken text-subtle",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className={cn("line-clamp-2 text-base font-medium", active ? "text-ink" : "text-ink-2")}>
                  {topic.title || "Untitled topic"}
                </span>
                <TypeBadge type={topic.tag} className="font-normal text-muted" />
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
        {isModerator && (
          <Button variant="ghost" size="sm" icon={Plus} onClick={addTopic} className="shrink-0 justify-start self-center text-muted lg:mt-1 lg:self-stretch">
            Add topic
          </Button>
        )}
      </nav>
      <nav aria-label="General" className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 lg:flex-col lg:px-0">
        <Overline className="hidden px-3 pb-1.5 lg:block">General</Overline>
        {GENERAL.map(({ kind, label, icon: Icon }) => {
          const active = section.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => selectGeneral(kind)}
              className={cn(item(active), "flex shrink-0 items-center gap-2.5 text-base font-medium", active ? "text-ink" : "text-ink-2")}
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
