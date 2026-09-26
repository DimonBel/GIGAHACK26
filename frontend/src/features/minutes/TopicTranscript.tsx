import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Topic } from "@/api/types";
import { cn } from "@/shared/lib/cn";
import { Dot } from "@/shared/ui";
import { formatSeconds, NONE, topicLines, useMinutesStore } from "@/stores/minutes";

import { speakerColor, speakerName } from "./speakers";

/** The part of the transcript that belongs to this topic; opens at a time clicked in the minutes. */
export function TopicTranscript({ topic }: { topic: Topic }) {
  const transcript = useMinutesStore((s) => s.transcript);
  const topics = useMinutesStore((s) => s.doc?.topics ?? NONE);
  const participants = useMinutesStore((s) => s.doc?.participants ?? NONE);
  const focus = useMinutesStore((s) => (s.focus?.topicId === topic.id ? s.focus : null));
  const lines = useMemo(() => topicLines(transcript, topics, topic.id), [transcript, topics, topic.id]);
  const [open, setOpen] = useState(false);
  const target = useRef<HTMLLIElement>(null);

  // The line being said at the clicked time (the last one that started before it).
  const focused = focus ? lines.findLastIndex((l) => l.start <= focus.seconds + 0.5) : -1;
  const show = open || focus !== null;

  useEffect(() => {
    if (focus) target.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  if (!lines.length) return null;
  return (
    <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
      <button
        type="button"
        aria-expanded={show}
        onClick={() => {
          setOpen(!show);
          if (show) useMinutesStore.getState().clearFocus();
        }}
        className="flex items-center gap-1.5 self-start rounded-md text-base font-medium text-primary hover:text-primary-hover"
      >
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", !show && "-rotate-90")}
          strokeWidth={2}
        />
        {show ? "Hide" : "Show"} transcript · {lines.length} lines
      </button>
      {show && (
        <ol className="flex max-h-[480px] flex-col gap-1 overflow-y-auto rounded-lg bg-canvas p-2">
          {lines.map((line, i) => (
            <li
              key={`${line.start}-${i}`}
              ref={i === focused ? target : undefined}
              className={cn(
                "grid gap-x-4 gap-y-0.5 rounded-md px-3 py-2 text-base sm:grid-cols-[150px_minmax(0,1fr)]",
                i === focused && "bg-primary-soft ring-1 ring-primary/30",
              )}
            >
              <span className="flex items-center gap-2">
                <Dot className={speakerColor(line.speaker)} />
                <span className="truncate font-medium text-ink">
                  {speakerName(participants, line.speaker)}
                </span>
                <span className="text-sm text-muted tabular-nums">{formatSeconds(line.start)}</span>
              </span>
              <p className="text-ink-2">{line.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
