import type { Topic } from "@/shared/types/domain";
import { Textarea } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { Block } from "./Block";

export function SummaryBlock({ topic, editing }: { topic: Topic; editing: boolean }) {
  const updateTopic = useMinutesStore((s) => s.updateTopic);
  return (
    <Block label="Summary">
      {editing ? (
        <Textarea
          rows={4}
          value={topic.summary}
          onChange={(e) => updateTopic(topic.id, { summary: e.target.value })}
          aria-label="Summary"
          className="font-sans text-lg"
        />
      ) : (
        <p className="max-w-[68ch] font-sans text-xl font-semibold text-pretty text-ink">{topic.summary || "—"}</p>
      )}
    </Block>
  );
}
