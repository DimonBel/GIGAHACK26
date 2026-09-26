import { ChevronDown, Lightbulb, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { MinutesDoc } from "@/api/types";
import { cn } from "@/shared/lib/cn";
import { formatDuration } from "@/shared/lib/date";
import { EmptyState, Field, Input, Textarea } from "@/shared/ui";
import { timeToSeconds, useMinutesStore } from "@/stores/minutes";

/** The topic being discussed at a time: the last one that started before it. */
function topicAt(doc: MinutesDoc, time: string) {
  const at = timeToSeconds(time) ?? 0;
  return [...doc.topics]
    .filter((t) => timeToSeconds(t.time) !== null)
    .sort((a, b) => (timeToSeconds(a.time) ?? 0) - (timeToSeconds(b.time) ?? 0))
    .findLast((t) => (timeToSeconds(t.time) ?? 0) <= at);
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">{children}</h3>;
}

export function OverviewSection({
  doc,
  editing,
  duration,
}: {
  doc: MinutesDoc;
  editing: boolean;
  duration: number | null;
}) {
  const { updateDoc, select, focusTime } = useMinutesStore();
  const [showWarnings, setShowWarnings] = useState(false);
  const tasks = doc.topics
    .flatMap((t) => t.blocks)
    .reduce((n, b) => n + (b.kind === "tasks" ? b.items.length : 0), 0);
  const stats = [
    { label: "Topics", value: doc.topics.length },
    { label: "Tasks", value: tasks },
    { label: "Speakers", value: doc.participants.length },
    { label: "Length", value: formatDuration(duration) },
  ];

  const openAt = (time: string) => {
    const topic = topicAt(doc, time);
    if (!topic) return;
    select({ kind: "topic", id: topic.id });
    focusTime(topic.id, time);
  };

  return (
    <div className="flex flex-col gap-8">
      {editing ? (
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input
              value={doc.title}
              onChange={(e) => updateDoc({ title: e.target.value })}
              maxLength={200}
              className="h-12 text-2xl font-semibold"
            />
          </Field>
          <Field label="Summary" hint="2–3 sentences for someone who missed the meeting.">
            <Textarea
              rows={4}
              value={doc.summary}
              onChange={(e) => updateDoc({ summary: e.target.value })}
              className="text-lg"
            />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="font-sans text-3xl font-bold text-balance">{doc.title || "Minutes"}</h2>
          {doc.summary ? (
            <p className="max-w-[68ch] text-xl text-pretty text-ink">{doc.summary}</p>
          ) : (
            <EmptyState>No summary.</EmptyState>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 bg-white px-4 py-3">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      {doc.keyMoments.length > 0 && (
        <section className="flex flex-col gap-3">
          <Heading>Key moments</Heading>
          <ol className="flex flex-col">
            {doc.keyMoments.map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => openAt(m.time)}
                  className="group -mx-2 grid w-full grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-canvas"
                >
                  <span className="text-base text-muted tabular-nums group-hover:text-primary">{m.time}</span>
                  <span className="text-md text-ink">{m.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {doc.aiSuggestions.length > 0 && (
        <section className="flex flex-col gap-3">
          <Heading>Worth a second look</Heading>
          <ul className="flex flex-col gap-2">
            {doc.aiSuggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-md text-ink-2">
                <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.75} />
                {s}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Suggested by the AI from the facts above; not part of the minutes.
          </p>
        </section>
      )}

      {doc.warnings.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-warn-line bg-warn-bg px-4 py-3">
          <button
            type="button"
            aria-expanded={showWarnings}
            onClick={() => setShowWarnings(!showWarnings)}
            className="flex items-center gap-2 text-left text-base font-medium text-warn"
          >
            <TriangleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {doc.warnings.length} value{doc.warnings.length === 1 ? "" : "s"} could not be found in the
            transcript
            <ChevronDown
              aria-hidden
              className={cn("ml-auto size-4 transition-transform", !showWarnings && "-rotate-90")}
              strokeWidth={2}
            />
          </button>
          {showWarnings && (
            <ul className="flex flex-col gap-1 pl-6 text-base text-ink-2">
              {doc.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="pl-6 text-sm text-muted">
            They are marked “Check” in the topics. Compare them with the recording.
          </p>
        </section>
      )}
    </div>
  );
}
