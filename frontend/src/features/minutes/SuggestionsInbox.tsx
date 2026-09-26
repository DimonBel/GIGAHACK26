import type { Topic } from "@/shared/types/domain";
import { Button } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

export function SuggestionsInbox({ topic }: { topic: Topic }) {
  const { acceptSuggestion, declineSuggestion } = useMinutesStore();
  if (!topic.suggestions.length) return null;
  return (
    <div className="flex flex-col gap-2 pb-6">
      {topic.suggestions.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn-line bg-warn-bg px-4 py-3"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-warn">
              {s.kind} suggested by {s.from}
            </span>
            <span className="text-md text-ink">{s.text}</span>
          </div>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => declineSuggestion(topic.id, s.id)}>
              Decline
            </Button>
            <Button size="sm" onClick={() => acceptSuggestion(topic.id, s.id)}>
              Add to minutes
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
