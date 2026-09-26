import { ChevronDown } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import type { Topic } from "@/shared/types/domain";
import { useMinutesStore } from "@/stores/minutes";

export function TranscriptToggle({ topic }: { topic: Topic }) {
  const { showTranscript, toggleTranscript } = useMinutesStore();
  if (!topic.transcript.length) return null;
  return (
    <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
      <button
        type="button"
        aria-expanded={showTranscript}
        onClick={toggleTranscript}
        className="flex items-center gap-1.5 self-start rounded-md text-base font-medium text-primary hover:text-primary-hover"
      >
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", !showTranscript && "-rotate-90")}
          strokeWidth={2}
        />
        {showTranscript ? "Hide" : "Show"} transcript · {topic.transcript.length} lines
      </button>
      {showTranscript && (
        <ol className="flex flex-col gap-3 rounded-lg bg-canvas p-4">
          {topic.transcript.map((line) => (
            <li key={`${line.ts}-${line.who}`} className="grid gap-x-4 gap-y-0.5 text-base sm:grid-cols-[120px_minmax(0,1fr)]">
              <span className="flex flex-col">
                <span className="font-medium text-ink">{line.who}</span>
                <span className="text-sm text-muted tabular-nums">
                  {line.ts} · {line.langs}
                </span>
              </span>
              <p className="text-ink-2">{line.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
