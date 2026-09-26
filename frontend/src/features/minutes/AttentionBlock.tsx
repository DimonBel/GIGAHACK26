import { CircleAlert, X } from "lucide-react";

import type { Topic } from "@/shared/types/domain";
import { EmptyState, IconButton, Input } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { AddButton, Block } from "./Block";

/** Risks and open points that need someone's attention. */
export function AttentionBlock({ topic, editing }: { topic: Topic; editing: boolean }) {
  const { addAttention, updateAttention, removeAttention } = useMinutesStore();
  return (
    <Block label="Needs attention">
      {editing ? (
        <>
          {topic.attention.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Input
                value={p.text}
                onChange={(e) => updateAttention(topic.id, p.id, e.target.value)}
                aria-label="Attention point"
              />
              <IconButton icon={X} label="Remove attention point" onClick={() => removeAttention(topic.id, p.id)} />
            </div>
          ))}
          <AddButton onClick={() => addAttention(topic.id)}>Add attention point</AddButton>
        </>
      ) : topic.attention.length ? (
        <ul className="flex flex-col gap-2">
          {topic.attention.map((p) => (
            <li key={p.id} className="flex gap-2.5 rounded-md bg-danger-soft px-3.5 py-2.5 text-body text-danger-ink">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.75} />
              {p.text}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Nothing flagged.</EmptyState>
      )}
    </Block>
  );
}
