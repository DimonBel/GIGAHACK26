import { useState } from "react";

import type { Suggestion, Topic } from "@/api/types";
import { Button, Select } from "@/shared/ui";
import { defaultTarget, useMinutesStore } from "@/stores/minutes";

const NEW = "__new";

function SuggestionCard({ topic, suggestion: s }: { topic: Topic; suggestion: Suggestion }) {
  const { acceptSuggestion, declineSuggestion } = useMinutesStore();
  const targets = topic.blocks.filter((b) => b.kind === "list" || b.kind === "tasks");
  const [target, setTarget] = useState(defaultTarget(topic, s) ?? NEW);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warn-line bg-warn-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-warn">
          {s.kind} · suggested by {s.author ?? "a participant"}
        </span>
        <span className="text-md text-ink">{s.text}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Add to block"
          className="h-8 w-44 text-base"
        >
          {targets.map((b) => (
            <option key={b.id} value={b.id}>
              Into “{b.label}”
            </option>
          ))}
          <option value={NEW}>Into a new block</option>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => declineSuggestion(s.id)}>
          Decline
        </Button>
        <Button size="sm" onClick={() => acceptSuggestion(s.id, target === NEW ? null : target)}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Moderator: what participants suggested for this topic. */
export function SuggestionsInbox({ topic }: { topic: Topic }) {
  const suggestions = useMinutesStore((s) => s.suggestions);
  const mine = suggestions.filter((s) => s.topicId === topic.id && s.state === "open");
  if (!mine.length) return null;
  return (
    <div className="flex flex-col gap-2 pb-6">
      {mine.map((s) => (
        <SuggestionCard key={s.id} topic={topic} suggestion={s} />
      ))}
    </div>
  );
}
